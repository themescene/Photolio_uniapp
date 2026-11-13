import copy
import tempfile
import unittest
from pathlib import Path
from dev_server import SpaceRepository, SpaceConflict, SpaceService, SpaceContent, dispatch_space


class Gateway:
    public = True
    deleted = False
    archived = False

    def related_ids(self, user):
        return {user, 'old-a'} if user == 'a' else {user}

    def shares(self, user):
        return [{'share_id': 'share_a', 'report_title': '我的相册', 'share_type': 'album'}] if user in ('a', 'old-a') else []

    def share(self, user, sid):
        if self.deleted:
            raise FileNotFoundError('已删除')
        return {'share_id': sid, 'share_type': 'album', 'report': {'report_title': '我的相册', 'episodes': [
            {'episode_id': None, 'copywriting': {'body': '原文不变'}, 'images': [
                {'image_url': '/uploads/session/photo.jpg', 'archived': self.archived}]}]}}, self.public

    def share_href(self, sid, share):
        return '/#/pages/album/index?id=' + sid

    def groups(self, user):
        return []

    def presets(self, user):
        return []


class SpacesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.gateway = Gateway()
        self.repo = SpaceRepository(self.temp.name)
        self.service = SpaceService(self.repo, SpaceContent(self.gateway))
        self.a = self.service.create('a', '用户A空间')
        self.b = self.service.create('b', '用户B空间')

    def tearDown(self):
        self.temp.cleanup()

    def test_two_users_and_anonymous_deep_link(self):
        self.assertNotEqual(self.a['space_id'], self.b['space_id'])
        self.assertEqual(self.service.mine('a')[0]['title'], '用户A空间')
        public = self.service.read(self.a['space_id'])
        self.assertFalse(public['can_edit'])
        self.assertNotIn('owner_user_id', public)
        self.assertTrue(self.service.read(self.a['space_id'], 'a')['can_edit'])
        with self.assertRaises(PermissionError):
            self.service.update('b', self.a['space_id'], self.a)
        with self.assertRaises(PermissionError):
            dispatch_space(self.service, 'PUT', self.a['space_id'], None, {}, self.a)

    def test_restart_persistence_and_optimistic_lock(self):
        self.a['title'] = '修改后'
        self.service.update('a', self.a['space_id'], self.a)
        restarted = SpaceService(SpaceRepository(self.temp.name), SpaceContent(self.gateway))
        self.assertEqual(restarted.read(self.a['space_id'])['title'], '修改后')
        with self.assertRaises(SpaceConflict):
            self.service.update('a', self.a['space_id'], self.a)

    def test_all_layouts_and_text_no_generation(self):
        self.a['sections'] = [{'id': layout, 'title': layout, 'layout': layout, 'blocks': [
            {'id': 'text', 'title': '', 'kind': 'text', 'text': '  原文\n<不变> \n', 'span': 1, 'display': 'embed'}]}
            for layout in ('grid', 'vertical', 'horizontal', 'masonry')]
        saved = self.service.update('a', self.a['space_id'], self.a)
        self.assertEqual(saved['sections'][0]['blocks'][0]['text'], '  原文\n<不变> \n')
        self.assertEqual(len(saved['sections']), 4)

    def with_reference(self):
        items = self.service.source.list('a', 'share', 'share_a')
        image = next(i for i in items if i['type'] == 'image')
        self.a['sections'][0]['blocks'] = [{'id': 'image', 'title': '相片', 'kind': 'reference', 'ref': image['ref']}]
        return self.service.update('a', self.a['space_id'], self.a)

    def test_reference_uses_stable_media_key_and_public_validation(self):
        saved = self.with_reference()
        self.assertEqual(saved['sections'][0]['blocks'][0]['resolved']['url'], '/uploads/session/photo.jpg')
        self.gateway.public = False
        hidden = self.service.read(self.a['space_id'])['sections'][0]['blocks'][0]['resolved']
        self.assertEqual(hidden['type'], 'unavailable')
        self.assertNotIn('url', hidden)
        with self.assertRaises(ValueError):
            self.service.update('a', self.a['space_id'], saved)

    def test_deleted_and_archived_references_do_not_break_page(self):
        self.with_reference()
        self.gateway.archived = True
        self.assertEqual(self.service.read(self.a['space_id'])['sections'][0]['blocks'][0]['resolved']['type'], 'unavailable')
        self.gateway.deleted = True
        self.assertEqual(self.service.read(self.a['space_id'])['sections'][0]['blocks'][0]['resolved']['type'], 'unavailable')

    def test_template_has_no_personal_data_and_legacy_owner(self):
        template = self.service.template()
        self.assertFalse(template['sections'][0]['blocks'])
        self.assertNotIn('owner_user_id', template)
        self.assertNotEqual(self.a['sections'][0]['id'], self.b['sections'][0]['id'])
        old = self.service.create('old-a', '旧身份空间')
        self.assertTrue(self.service.read(old['space_id'], 'a')['can_edit'])

    def test_invalid_layout_ids_and_urls_are_rejected(self):
        for url in ('javascript:alert(1)', 'data:text/html,<script>', 'https://user:pass@example.com/a'):
            payload = copy.deepcopy(self.a)
            payload['sections'][0]['blocks'] = [{'id': 'url', 'title': '', 'kind': 'url', 'url': url, 'media_type': 'file'}]
            with self.assertRaises(ValueError):
                self.service.update('a', self.a['space_id'], payload)
        self.a['sections'][0]['layout'] = 'unknown'
        with self.assertRaises(ValueError):
            self.service.update('a', self.a['space_id'], self.a)
        with self.assertRaises(ValueError):
            self.repo.get('../secrets')

    def test_other_users_source_and_forged_owner_are_rejected(self):
        items = self.service.source.list('a', 'share', 'share_a')
        self.b['sections'][0]['blocks'] = [{'id': 'forged', 'title': '', 'kind': 'reference', 'ref': items[0]['ref']}]
        with self.assertRaises(PermissionError):
            self.service.update('b', self.b['space_id'], self.b)
        self.a['owner_user_id'] = 'b'
        self.service.update('a', self.a['space_id'], self.a)
        self.assertEqual(self.repo.get(self.a['space_id'])['owner_user_id'], 'a')

    def test_cover_permissions_and_fixed_layout_round_trip(self):
        image = next(i for i in self.service.source.list('a', 'share', 'share_a') if i['type'] == 'image')
        section = self.a['sections'][0]
        section.update(fixed_size=True, aspect_ratio='16:9')
        section['blocks'] = [{'id': 'doc', 'title': 'resume', 'kind': 'url', 'url': 'https://example.com/cv.pdf',
                              'media_type': 'file', 'image_fit': 'top', 'autoplay': False, 'cover_ref': image['ref']}]
        saved = self.service.update('a', self.a['space_id'], self.a)
        block = saved['sections'][0]['blocks'][0]
        self.assertEqual(block['cover_url'], '/uploads/session/photo.jpg')
        self.assertEqual(block['image_fit'], 'top')
        self.assertFalse(block['autoplay'])
        clone = self.service.create('b', 'template copy', saved['space_id'])
        self.assertTrue(clone['sections'][0]['fixed_size'])
        self.assertEqual(clone['sections'][0]['aspect_ratio'], '16:9')
        self.assertNotIn('cover_ref', clone['sections'][0]['blocks'][0])
        self.assertNotIn('cover_url', clone['sections'][0]['blocks'][0])
        self.gateway.public = False
        self.assertEqual(self.service.read(self.a['space_id'])['sections'][0]['blocks'][0]['cover_url'], '')
        with self.assertRaises(ValueError): self.service.update('a', self.a['space_id'], saved)

    def test_gif_and_invalid_presentation_options(self):
        section = self.a['sections'][0]
        section['blocks'] = [{'id': 'gif', 'kind': 'url', 'url': 'https://example.com/image.gif', 'media_type': 'gif'}]
        saved = self.service.update('a', self.a['space_id'], self.a)
        self.assertEqual(saved['sections'][0]['blocks'][0]['media_type'], 'gif')
        for ratio in ('0:0', '10000:1'):
            broken = copy.deepcopy(saved); broken['sections'][0]['aspect_ratio'] = ratio
            with self.assertRaises(ValueError): self.service.update('a', self.a['space_id'], broken)
        broken = copy.deepcopy(saved); broken['sections'][0]['blocks'][0]['image_fit'] = 'arbitrary-css'
        with self.assertRaises(ValueError): self.service.update('a', self.a['space_id'], broken)

    def test_copy_layout_keeps_geometry_but_clears_personal_content(self):
        saved = self.with_reference()
        clone = self.service.create('b', '新空间', saved['space_id'])
        self.assertEqual(clone['template_version'], saved['revision'])
        slot = clone['sections'][0]['blocks'][0]
        self.assertEqual(slot['kind'], 'empty')
        self.assertNotIn('ref', slot)
        self.assertNotIn('resolved', slot)
        self.assertEqual(slot['title'], '')
        self.assertEqual(clone['template_id'], 'space-layout:' + saved['space_id'])
        with self.assertRaises(ValueError):
            dispatch_space(self.service, 'POST', '', 'a', {}, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
