'use strict';

// 이 파일은 창에서 <script> 로도 읽고 메인에서 require 로도 읽는다.
// 여러 <script> 는 전역을 함께 쓰므로, 안에 든 이름이 서로 부딪히지 않게 감싸 둔다.
(function attach(root) {

  // 두 번 누른 것을 직접 센다.
  // 끌기를 위해 pointerdown 의 기본 동작을 막으면 브라우저가 dblclick 을 만들어 주지 않는다.
  // 같은 대상을 정해진 시간 안에 두 번 누르면 tap 이 true 를 돌려준다.

  const DOUBLE_MS = 450;

  function createTaps(windowMs = DOUBLE_MS, clock = () => Date.now()) {
    let last = { key: null, at: 0 };

    return {
      // 두 번째로 누른 것이면 true. 그때 기록을 비워 세 번째 누름이 또 세지 않게 한다.
      tap(key) {
        const now = clock();
        if (key !== null && key === last.key && now - last.at < windowMs) {
          last = { key: null, at: 0 };
          return true;
        }
        last = { key, at: now };
        return false;
      },
      // 끌기처럼 누름이 아닌 동작이 끼어들면 센 것을 버린다.
      forget() {
        last = { key: null, at: 0 };
      },
      pending() {
        return last.key;
      },
    };
  }
  const api = { DOUBLE_MS, createTaps };

  root.DeskTaps = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
