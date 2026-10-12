"use client";
// Work reel: a swipeable, snap-scrolling row of project photos. Visitors drag or swipe
// on touch, use the arrow buttons, or focus the row and use the arrow keys. A thin bar
// under the row shows how far through the set they are. Nothing moves on its own.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useScroll } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReelItem = {
  src: string;
  alt: string;
  caption?: string;
  /** Short context shown above the caption, e.g. "Coating" or "Interior". */
  tag?: string;
  width?: number;
  height?: number;
};

export function WorkReel({
  items,
  label,
  heading,
  className,
}: {
  items: readonly ReelItem[];
  /** Accessible name for the scrolling region. */
  label: string;
  /** Optional content shown left of the arrow buttons. */
  heading?: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const { scrollXProgress } = useScroll({ container: scroller });
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  function step(direction: 1 | -1) {
    const el = scroller.current;
    const card = el?.querySelector("li");
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(card.parentElement!).columnGap) || 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * (card.getBoundingClientRect().width + gap), behavior: reduce ? "auto" : "smooth" });
  }

  const arrow = "size-11 rounded-full border-[color-mix(in_srgb,currentColor_30%,transparent)] bg-transparent hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)] disabled:opacity-35 dark:bg-transparent dark:hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]";

  return (
    <div className={cn("flex flex-col gap-7", className)}>
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">{heading}</div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="icon" className={arrow} aria-label="Previous photos" disabled={edges.start} onClick={() => step(-1)}>
            <ChevronLeft aria-hidden className="size-5" strokeWidth={1.75} />
          </Button>
          <Button type="button" variant="outline" size="icon" className={arrow} aria-label="Next photos" disabled={edges.end} onClick={() => step(1)}>
            <ChevronRight aria-hidden className="size-5" strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      <div
        ref={scroller}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={measure}
        className="-mx-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-px-1 rounded-[18px] px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="m-0 flex list-none gap-4 p-0">
          {items.map(item => (
            <li key={item.src} className="w-[76%] shrink-0 snap-start sm:w-[44%] lg:w-[calc((100%-3rem)/4)]">
              <figure className="m-0 flex flex-col gap-3.5">
                <div className="overflow-hidden rounded-[16px] border border-border bg-(--soft)">
                  <img
                    src={item.src}
                    alt={item.alt}
                    width={item.width ?? 1200}
                    height={item.height ?? 1600}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[3/4] w-full object-cover"
                  />
                </div>
                {(item.tag || item.caption) && (
                  <figcaption className="flex flex-col gap-0.5 text-[15px] leading-snug">
                    {item.tag && <span className="text-[13px] text-muted-foreground">{item.tag}</span>}
                    {item.caption && <span className="font-medium">{item.caption}</span>}
                  </figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>
      </div>

      <div className="h-px overflow-hidden bg-border" aria-hidden>
        <motion.div className="h-full origin-left bg-(--text)" style={{ scaleX: scrollXProgress }} />
      </div>
    </div>
  );
}
