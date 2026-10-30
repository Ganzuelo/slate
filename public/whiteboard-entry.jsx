import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, MainMenu, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { validateWhiteboard } from '../whiteboard.mjs';

window.EXCALIDRAW_ASSET_PATH = '/vendor/whiteboard/';

export function mount(host, { content, icon, onChange, onError, onSave, name }) {
  const scene = validateWhiteboard(content);
  const root = createRoot(host);
  let disposed = false, baseline, initialized = false;
  const save = () => { Promise.resolve(onSave()).catch(onError); };
  function render() {
    root.render(<Excalidraw
      initialData={{ ...scene, appState: { ...scene.appState, openMenu: null, openSidebar: null }, scrollToContent: true }}
      name={name} theme={document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'}
      handleKeyboardGlobally={false} autoFocus={true}
      UIOptions={{ canvasActions: { saveToActiveFile: false, toggleTheme: false, export: { saveFileToDisk: true } } }}
      validateEmbeddable={() => false} onLinkOpen={(element,event) => { event.preventDefault(); }}
      onChange={(elements, state, files) => {
        if (disposed) return;
        const next = serializeAsJSON(elements, state, files, 'local');
        if (!initialized) { baseline = next; initialized = true; return; }
        if (next !== baseline) { baseline = next; onChange(next); }
      }}>
      <MainMenu>
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.Item onSelect={save} shortcut="Ctrl+S" icon={<span dangerouslySetInnerHTML={{ __html: icon('save') }} />}>Save to Slate</MainMenu.Item>
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.CommandPalette />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
    </Excalidraw>);
  }
  // Ctrl+S uses Slate's revision-checked vault API; Excalidraw owns drawing UI.
  const keydown = event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); save();
    }
  };
  host.addEventListener('keydown', keydown, true);
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  render();
  return { dispose() { disposed = true; observer.disconnect(); host.removeEventListener('keydown', keydown, true); root.unmount(); } };
}
