import './localization';
import { initMapSelector } from './mapSelector';
import options from './options';
import { Roulette } from './roulette';

// BG 룰렛: 원본의 광고(AdService), 원작자 통계(umami), 맵 공유마당 서버 연동은 제거했다.
// 기본 내장 맵만 사용한다.

const roulette = new Roulette();

(window as any).roulette = roulette;

// index.html 이 초기화할 때 부른다. 맵 공유마당(외부 서버)은 쓰지 않는다.
(window as any).initMapSelector = (onMapChange: () => void, toast: (key: string) => void) =>
  initMapSelector({ roulette, apiBase: '', onMapChange, toast, mapBrowser: false });

(window as any).options = options;
