import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { Compartment } from "@codemirror/state";

let editorView: EditorView;
let changeCallback: (() => void) | null = null;

const themeCompartment = new Compartment();

export function onEditorChange(cb: () => void) {
  changeCallback = cb;
}

export function initEditor(parent: HTMLElement) {
  const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

  editorView = new EditorView({
    doc: "# Welcome to med\n\nStart typing your Markdown here...\n\n## Features\n\n- Live preview\n- Syntax highlighting\n- Split screen editing\n",
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      themeCompartment.of(darkMode ? oneDark : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && changeCallback) {
          changeCallback();
        }
      }),
    ],
    parent,
  });

  // Set up key binding for bold/italic
  editorView.dom.addEventListener("keydown", (e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === "b") {
      e.preventDefault();
      wrapSelection("**");
    } else if (meta && e.key === "i") {
      e.preventDefault();
      wrapSelection("*");
    }
  });
}

export function getEditorContent(): string {
  return editorView.state.doc.toString();
}

export function setEditorContent(content: string) {
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: content,
    },
  });
}

export function wrapSelection(wrapper: string) {
  const { from, to } = editorView.state.selection.main;
  const selected = editorView.state.sliceDoc(from, to);
  const wrapped = wrapper + selected + wrapper;
  editorView.dispatch({
    changes: { from, to, insert: wrapped },
    selection: { anchor: from + wrapper.length, head: from + wrapped.length - wrapper.length },
  });
}

export function insertAtCursor(text: string) {
  const { from } = editorView.state.selection.main;
  editorView.dispatch({
    changes: { from, insert: text },
    selection: { anchor: from + text.length },
  });
}

export function toggleLinePrefix(prefix: string) {
  const { from } = editorView.state.selection.main;
  const line = editorView.state.doc.lineAt(from);
  const lineText = line.text;
  if (lineText.startsWith(prefix + " ")) {
    editorView.dispatch({
      changes: { from: line.from, to: line.from + prefix.length + 1 },
    });
  } else if (lineText.startsWith(prefix)) {
    editorView.dispatch({
      changes: { from: line.from, to: line.from + prefix.length },
    });
  } else {
    editorView.dispatch({
      changes: { from: line.from, insert: prefix + " " },
    });
  }
}

export function getEditor(): EditorView {
  return editorView;
}

let isDarkTheme = false;
export function setEditorTheme(dark: boolean) {
  if (dark === isDarkTheme) return;
  isDarkTheme = dark;
  editorView.dispatch({
    effects: themeCompartment.reconfigure(dark ? oneDark : []),
  });
}
