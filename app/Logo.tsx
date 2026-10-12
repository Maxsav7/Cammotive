// Camotive lockup: the chrome "C" redrawn as a vector (crisp at any size, no
// background box), set beside a typeset wordmark.
import { useId } from "react";

export function LogoMark({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return <svg className={className} viewBox="0 0 200 180" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-chrome`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".34" stopColor="#c7c7d0" />
        <stop offset=".49" stopColor="#6e6e7a" />
        <stop offset=".55" stopColor="#9c9ca8" />
        <stop offset=".78" stopColor="#e6e6ec" />
        <stop offset="1" stopColor="#8a8a96" />
      </linearGradient>
      <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset=".55" stopColor="#fff" stopOpacity=".55" />
        <stop offset=".7" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d="M200 0 170 30H92a60 60 0 0 0 0 120h108l-30 30H90A90 90 0 0 1 90 0Z" fill={`url(#${id}-chrome)`} stroke="#2b2a33" strokeWidth="2" strokeLinejoin="round" />
    <path d="M200 0 170 30H92a60 60 0 0 0 0 120h108l-30 30H90A90 90 0 0 1 90 0Z" fill={`url(#${id}-sheen)`} opacity=".6" />
  </svg>;
}

export default function Logo({ className = "" }: { className?: string }) {
  return <span className={`logo ${className}`}>
    <LogoMark className="logo-mark" />
    <span className="logo-word"><span className="logo-name">Camotive</span><span className="logo-sub">Detailing</span></span>
  </span>;
}
