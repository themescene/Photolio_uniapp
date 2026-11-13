"""现有画匣子只读适配。缓存仅限当前请求；保存/公开读取重新检查源权限。"""
import json
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ORIGIN = 'https://hxiazi.com/api'


class RemoteGateway:
    def __init__(self, authorization):
        self.authorization = authorization
        self.cache = {}

    def get(self, path, anonymous=False):
        cache_key = (path, anonymous)
        if cache_key in self.cache:
            return self.cache[cache_key]
        started = time.perf_counter()
        headers = {} if anonymous or not self.authorization else {'Authorization': self.authorization}
        try:
            with urlopen(Request(ORIGIN + path, headers=headers), timeout=20) as response:
                result = json.load(response)
            value = result.get('data', result)
        except HTTPError as exc:
            if exc.code == 404:
                raise FileNotFoundError('源内容不存在或未公开') from None
            if exc.code in (401, 403):
                raise PermissionError('请重新登录或检查源内容权限') from None
            raise ValueError('画匣子服务暂时无法读取，请稍后重试') from None
        print('[space-perf] ' + json.dumps({'path': path, 'anonymous': anonymous,
              'elapsed_ms': round((time.perf_counter() - started) * 1000)}, ensure_ascii=False), flush=True)
        self.cache[cache_key] = value
        return value

    def prefetch(self, query):
        paths = ['/auth/me']
        if query.get('source') == 'share' and query.get('id'):
            path = '/share/' + quote(query['id'], safe='')
            paths += ['/user/shares?type=all', path, path + '/permissions']
        else:
            sources = {'share': '/user/shares?type=all', 'group': '/user/groups', 'preset': '/presets/mine'}
            paths += [sources[query['category']]] if query.get('category') in sources else list(sources.values())
        with ThreadPoolExecutor(max_workers=4) as executor:
            # Exceptions remain uncached and are handled by the authoritative dispatch call.
            futures = [executor.submit(self.get, path) for path in paths]
            for future in futures:
                try:
                    future.result()
                except (PermissionError, FileNotFoundError):
                    pass

    def related_ids(self, user):
        if not self.authorization:
            return {user}
        me = self.get('/auth/me')
        return {user, me.get('linked_legacy_user_id')} - {None}

    def shares(self, user):
        return self.get('/user/shares?type=all').get('shares', [])

    def share(self, user, sid):
        path = '/share/' + quote(sid, safe='')
        share = dict(self.get(path))
        permissions = self.get(path + '/permissions')
        # 参考 share_service.can_view_share：1=链接可见、3=公开；其它值不能公开引用。
        visibility = permissions.get('visibility')
        if visibility in (0, 1, 2, 3):
            public = visibility in (1, 3)
        else:
            try:
                self.get(path, anonymous=True)
                public = True
            except (PermissionError, FileNotFoundError):
                public = False
        share['share_type'] = permissions.get('share_type', 'memory')
        return share, public

    def share_href(self, sid, share):
        # share详情不返回share_type；已认证列表已有该字段，匿名读取时默认原播放页。
        kind = share.get('share_type')
        page = 'album/index' if kind == 'album' else 'share/play'
        return '/#/pages/' + page + '?id=' + quote(sid, safe='')

    def groups(self, user):
        return self.get('/user/groups').get('groups', [])

    def group_members(self, user, gid):
        return self.get('/group/' + quote(gid, safe='') + '/memories').get('memories', [])

    def presets(self, user):
        return self.get('/presets/mine').get('presets', [])

    def preset(self, pid):
        return self.get('/preset/' + quote(pid, safe=''), anonymous=True)


