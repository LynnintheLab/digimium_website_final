"use client";

import { useEffect, useRef } from "react";

/** A single decorative light, with a separate clipped light on the active card. */
export function CursorLight({ paused }: { paused: boolean }) {
  const lightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const light = lightRef.current;
    const surface = light?.closest(".storefront-shell");
    if (!light || !surface || paused) return;

    const preference = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    let x = 0;
    let y = 0;
    let visible = false;
    let activeCard: HTMLElement | null = null;

    const clearCard = () => {
      if (activeCard) delete activeCard.dataset.cursorLit;
      activeCard = null;
    };

    const hide = () => {
      visible = false;
      light.removeAttribute("data-visible");
      clearCard();
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const paint = () => {
      frame = 0;
      if (!visible || !preference.matches) return;
      const target = document.elementFromPoint(x, y);
      if (!target || !surface.contains(target)) return hide();

      light.style.setProperty("--cursor-x", `${x}px`);
      light.style.setProperty("--cursor-y", `${y}px`);
      light.dataset.visible = "true";

      const card = target.closest<HTMLElement>(".product");
      if (card !== activeCard) clearCard();
      if (card) {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty("--card-x", `${x - bounds.left}px`);
        card.style.setProperty("--card-y", `${y - bounds.top}px`);
        card.dataset.cursorLit = "true";
        activeCard = card;
      }
    };

    const schedule = () => {
      if (visible && !frame) frame = requestAnimationFrame(paint);
    };
    const move = (event: PointerEvent) => {
      if (!preference.matches || event.pointerType !== "mouse") return hide();
      x = event.clientX;
      y = event.clientY;
      visible = true;
      schedule();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Tab") hide(); };
    const onVisibility = () => { if (document.hidden) hide(); };

    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", hide);
    document.addEventListener("pointercancel", hide);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("blur", hide);
    preference.addEventListener("change", hide);

    return () => {
      hide();
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", hide);
      document.removeEventListener("pointercancel", hide);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("blur", hide);
      preference.removeEventListener("change", hide);
    };
  }, [paused]);

  return <div className="cursor-light" ref={lightRef} aria-hidden="true" />;
}
