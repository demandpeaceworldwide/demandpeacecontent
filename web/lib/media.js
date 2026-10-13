// Drive view links are HTML pages, not MP4 streams. Keep private sharing intact.
function mediaLink(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Provide an HTTPS video or Google Drive file link');
  if (url.hostname !== 'drive.google.com') return { url: url.href, provider: 'direct', preview: null };
  if (url.port) throw new Error('Use a standard Google Drive file link');
  const match = /^\/file\/d\/([\w-]+)(?:\/(?:view|preview))?\/?$/.exec(url.pathname);
  const id = match ? match[1] : ['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null;
  if (!id || !/^[\w-]{10,200}$/.test(id)) throw new Error('Use the video file’s Drive link, not its folder link');
  const base = 'https://drive.google.com/file/d/' + id;
  const resourceKey = url.searchParams.get('resourcekey');
  const query = resourceKey ? '?' + new URLSearchParams({ resourcekey: resourceKey }) : '';
  return { url: base + '/view' + query, provider: 'drive', preview: base + '/preview' + query };
}
module.exports = { mediaLink };
