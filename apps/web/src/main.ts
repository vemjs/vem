import './style.css';
import typescriptLogo from './assets/typescript.svg';
import viteLogo from './assets/vite.svg';
import heroImg from './assets/hero.png';
import { setupCounter } from './counter.ts';

// Import our workspace packages to verify link is working
import { VemEditorState } from '@vemjs/core';
import { VectoRenderer } from '@vemjs/renderer-vecto';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<section id="center">
  <div class="hero">
    <img src="${heroImg}" class="base" width="170" height="179">
    <img src="${typescriptLogo}" class="framework" alt="TypeScript logo"/>
    <img src="${viteLogo}" class="vite" alt="Vite logo" />
  </div>
  <div>
    <h1>Vem Workspace Online</h1>
    <p>Monorepo integration verification complete!</p>
    <p id="core-state" style="color: #646cff; font-weight: bold;"></p>
  </div>
  <button id="counter" type="button" class="counter"></button>
</section>

<div class="ticks"></div>

<section id="next-steps">
  <div id="docs">
    <svg class="icon" role="presentation" aria-hidden="true"><use href="/icons.svg#documentation-icon"></use></svg>
    <h2>Documentation</h2>
    <p>Your questions, answered</p>
    <ul>
      <li>
        <a href="https://vite.dev/" target="_blank">
          <img class="logo" src="${viteLogo}" alt="" />
          Explore Vite
        </a>
      </li>
      <li>
        <a href="https://www.typescriptlang.org" target="_blank">
          <img class="button-icon" src="${typescriptLogo}" alt="">
          Learn more
        </a>
      </li>
    </ul>
  </div>
  <div id="social">
    <svg class="icon" role="presentation" aria-hidden="true"><use href="/icons.svg#social-icon"></use></svg>
    <h2>Connect with us</h2>
    <p>Join the Vite community</p>
    <ul>
      <li><a href="https://github.com/vitejs/vite" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="/icons.svg#github-icon"></use></svg>GitHub</a></li>
      <li><a href="https://chat.vite.dev/" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="/icons.svg#discord-icon"></use></svg>Discord</a></li>
    </ul>
  </div>
</section>

<div class="ticks"></div>
<section id="spacer"></section>
`;

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!);

// Instantiate our monorepo structures
const editorState = new VemEditorState();
editorState.setMode('INSERT');
editorState.moveCursor(12, 4);

const coreStateElement = document.getElementById('core-state');
if (coreStateElement) {
  coreStateElement.innerText = `[Core State Engine] Mode: ${editorState.getMode()} | Cursor: Line ${
    editorState.getCursor().line
  }, Char ${editorState.getCursor().character}`;
}

const renderer = new VectoRenderer(editorState);
const dummyCanvas = document.createElement('canvas');
renderer.attach(dummyCanvas);
