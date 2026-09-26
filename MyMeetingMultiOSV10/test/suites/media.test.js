import { MEDIA_ACCEPT, mediaKind, isMediaFile, readFileAsDataURL, loadMedia } from '../../src/lib/media.js';
import { eq, ok } from '../assert.js';

export const title = '미디어';

function file(name, type, body = 'data') {
  return new File([body], name, { type });
}

export default async function suite(test) {
  await test('이미지, 동영상, 오디오만 미디어로 받는다', () => {
    eq(MEDIA_ACCEPT, 'image/*,video/*,audio/*');
    eq(mediaKind(file('a.png', 'image/png')), 'image');
    eq(mediaKind(file('a.gif', 'image/gif')), 'image');
    eq(mediaKind(file('a.svg', 'image/svg+xml')), 'image');
    eq(mediaKind(file('a.mp4', 'video/mp4')), 'video');
    eq(mediaKind(file('a.mp3', 'audio/mpeg')), 'audio');
    eq(mediaKind(file('a.txt', 'text/plain')), '');
    eq(mediaKind(null), '');
    ok(isMediaFile(file('a.png', 'image/png')));
    ok(!isMediaFile(file('a.txt', 'text/plain')));
  });

  await test('파일을 data URL로 읽어 문서에 넣을 수 있다', async () => {
    const url = await readFileAsDataURL(file('note.txt', 'text/plain', 'hello'));
    ok(String(url).startsWith('data:text/plain'));
  });

  await test('동영상과 오디오는 재인코딩 없이 넣고 지원하지 않는 파일은 거절한다', async () => {
    const video = await loadMedia(file('clip.mp4', 'video/mp4', 'frames'));
    eq(video.kind, 'video');
    eq(video.width, 600);
    ok(String(video.dataUrl).startsWith('data:video/mp4'));
    const audio = await loadMedia(file('talk.mp3', 'audio/mpeg', 'sound'));
    eq(audio.kind, 'audio');
    eq(audio.width, 0);
    ok(String(audio.dataUrl).startsWith('data:audio/mpeg'));
    let rejected = false;
    try {
      await loadMedia(file('notes.txt', 'text/plain', 'nope'));
    } catch (error) {
      rejected = /Unsupported media type/.test(error.message);
    }
    ok(rejected, 'unsupported media is rejected');
  });
}
