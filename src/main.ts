import './style.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

// 픽셀 폰트가 준비된 뒤 장면을 만들어 캔버스 텍스처(간판)에도 같은 폰트가 쓰이게 한다
const fontReady = Promise.race([
  document.fonts.load('20px "DungGeunMo"').catch(() => undefined),
  new Promise((r) => setTimeout(r, 1500)),
]);
fontReady.then(() => new App(root));
