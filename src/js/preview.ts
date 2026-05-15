import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

// Configure marked to use highlight.js for code blocks
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code: string, lang: string): string {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (_) {
          // fall through
        }
      }
      try {
        return hljs.highlightAuto(code).value;
      } catch (_) {
        return code;
      }
    },
  })
);

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function updatePreview(markdown: string) {
  const previewEl = document.getElementById("preview")!;
  previewEl.innerHTML = marked.parse(markdown) as string;
}

export function setTheme(theme: "light" | "dark") {
  const previewEl = document.getElementById("preview")!;
  previewEl.classList.remove("light", "dark");
  previewEl.classList.add(theme);
}
