"""个人空间读取路径回归；全部使用假上游，不访问或修改生产数据。"""
import threading
import time
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from dev_server import SpaceContent
from remote_gateway import RemoteGateway
from test_spaces import Gateway


class ReadPathTests(unittest.TestCase):
    def test_category_only_loads_its_source(self):
        gateway = Gateway()
        with patch.object(gateway, 'groups', side_effect=AssertionError('不应读取合集')), patch.object(gateway, 'presets', side_effect=AssertionError('不应读取NFC')):
            self.assertEqual(len(SpaceContent(gateway).list('a', category='share')), 1)
        with patch.object(gateway, 'shares', side_effect=AssertionError('不应读取画匣子')):
            self.assertEqual(SpaceContent(gateway).list('a', category='group'), [])
        with self.assertRaises(ValueError):
            SpaceContent(gateway).list('a', category='invalid')

    def test_prefetch_parallel_and_request_scoped(self):
        gateway = RemoteGateway('test-only')
        barrier = threading.Barrier(4)
        calls = []
        def upstream(path, anonymous=False):
            calls.append(path)
            barrier.wait(timeout=2)  # All four must start together; serial implementation fails.
            gateway.cache[(path, anonymous)] = {}
            return {}
        with patch.object(gateway, 'get', side_effect=upstream):
            gateway.prefetch({'source':'share', 'id':'s1'})
        self.assertEqual(len(calls), 4)
        self.assertEqual(RemoteGateway('other').cache, {})

    def test_root_does_not_prefetch_unrelated_categories(self):
        gateway = RemoteGateway('test-only')
        with patch.object(gateway, 'get', return_value={}) as read:
            gateway.prefetch({'category':'share'})
        self.assertEqual({call.args[0] for call in read.call_args_list}, {'/auth/me', '/user/shares?type=all'})

    def test_share_reuses_prefetch_and_visibility_is_fresh(self):
        for visibility, public in ((0,False),(1,True),(2,False),(3,True)):
            gateway = RemoteGateway('test-only')
            gateway.cache[('/share/s1',False)] = {'report':{}}
            gateway.cache[('/share/s1/permissions',False)] = {'visibility':visibility,'share_type':'album'}
            with patch('remote_gateway.urlopen', side_effect=AssertionError('不应重复读取详情或匿名详情')):
                share, readable = gateway.share('a','s1')
            self.assertEqual(readable,public)
            self.assertEqual(share['share_type'],'album')
        # A new save/read gateway never inherits previous permissions.
        self.assertFalse(RemoteGateway('test-only').cache)


if __name__ == '__main__':
    unittest.main(verbosity=2)
