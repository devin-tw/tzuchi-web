// Hero photo carousel. Without this file the photos still scroll and swipe (CSS scroll-snap).
(() => {
  const root = document.querySelector(".carousel");
  if (!root) return;
  const track = root.querySelector(".slides");
  const slides = [...track.children];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const DELAY = 6500;
  let index = 0;
  let timer = null;
  let userPaused = reduce.matches;
  let hovering = false;

  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const button = (cls, label, svg) => {
    const b = document.createElement("button");
    b.type = "button";
    if (cls) b.className = cls;
    b.setAttribute("aria-label", label);
    b.innerHTML = svg;
    return b;
  };

  const ui = document.createElement("div");
  ui.className = "carousel-ui";
  const dots = document.createElement("div");
  dots.className = "carousel-dots";
  const dotButtons = slides.map((_, i) => {
    const d = button("", `Show photo ${i + 1} of ${slides.length}`, "");
    d.addEventListener("click", () => go(i));
    dots.append(d);
    return d;
  });
  const prev = button("prev", "Previous photo", icon('<path d="M15 5l-7 7 7 7"/>'));
  const next = button("next", "Next photo", icon('<path d="M9 5l7 7-7 7"/>'));
  const pause = button("pause", "Pause automatic slides",
    icon('<path class="stop" d="M9 6v12M15 6v12"/><path class="play" d="M8 5l11 7-11 7z"/>'));
  prev.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => go(index + 1));
  pause.addEventListener("click", () => { userPaused = !userPaused; sync(); });
  ui.append(dots, prev, next, pause);
  root.append(ui);

  function go(i) {
    index = (i + slides.length) % slides.length;
    track.scrollTo({ left: index * track.clientWidth, behavior: reduce.matches ? "auto" : "smooth" });
    mark();
  }

  function mark() {
    dotButtons.forEach((d, i) => (i === index ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
  }

  function sync() {
    clearInterval(timer);
    const running = !userPaused && !hovering;
    pause.setAttribute("aria-pressed", String(userPaused));
    pause.setAttribute("aria-label", userPaused ? "Play automatic slides" : "Pause automatic slides");
    track.setAttribute("aria-live", running ? "off" : "polite");
    if (running) timer = setInterval(() => go(index + 1), DELAY);
  }

  let settle;
  track.addEventListener("scroll", () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      index = Math.round(track.scrollLeft / track.clientWidth);
      mark();
    }, 60);
  }, { passive: true });

  for (const [on, off] of [["pointerenter", "pointerleave"], ["focusin", "focusout"]]) {
    root.addEventListener(on, () => { hovering = true; sync(); });
    root.addEventListener(off, () => { hovering = false; sync(); });
  }
  addEventListener("resize", () => track.scrollTo({ left: index * track.clientWidth, behavior: "auto" }));
  document.addEventListener("visibilitychange", () => { hovering = document.hidden; sync(); });

  mark();
  sync();
})();
