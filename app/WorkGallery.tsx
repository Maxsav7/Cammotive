"use client";

import { useState } from "react";

const photos = [
  ["mclaren-hero", "McLaren exterior with dihedral door raised", "Exterior"],
  ["mclaren-interior", "McLaren red leather and Alcantara interior", "Interior"],
  ["mclaren-front", "McLaren front exterior finish", "Exterior"],
  ["mclaren-rear", "McLaren rear during its wash", "Exterior"],
  ["mercedes-wheel", "Mercedes-Benz wheel and tire detail", "Exterior"],
  ["lamborghini-foam", "Lamborghini foam wash", "Exterior"],
  ["tundra-exterior", "Toyota Tundra exterior finish", "Exterior"],
  ["tundra-cabin", "Toyota Tundra front cabin", "Interior"],
  ["bmw-foam", "BMW foam wash", "Exterior"],
  ["tundra-rear-seats", "Toyota Tundra rear seats and floor", "Interior"],
  ["tundra-finish", "Toyota Tundra paint and trim", "Exterior"],
  ["tundra-console", "Toyota Tundra center console", "Interior"],
  ["lamborghini-front", "Lamborghini exterior wash", "Exterior"],
  ["tundra-steering", "Toyota Tundra steering wheel and dashboard", "Interior"],
  ["tundra-passenger", "Toyota Tundra passenger footwell", "Interior"],
  ["tundra-driver-floor", "Toyota Tundra driver floor and mat", "Interior"],
  ["tundra-rear-floor", "Toyota Tundra rear floor mats", "Interior"],
] as const;

export default function WorkGallery() {
  const [filter, setFilter] = useState("All");
  return <section className="section work-gallery">
    <div className="gallery-heading"><div><p className="eyebrow">Our work</p><h2>Care you can see.</h2></div><div className="gallery-filters" role="group" aria-label="Filter project photos">{["All", "Exterior", "Interior"].map(label => <button type="button" key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div></div>
    <div className="photo-grid">{photos.filter(photo => filter === "All" || photo[2] === filter).map(([file, caption]) => <figure key={file}><a href={`/work/${file}.jpg`} target="_blank" rel="noopener noreferrer" aria-label={`View full photo: ${caption} (opens in a new tab)`}><img src={`/work/${file}.jpg`} alt={caption} width="1200" height="1600" loading="lazy" decoding="async"/></a><figcaption>{caption}</figcaption></figure>)}</div>
    <div className="section-heading centered video-heading"><p className="eyebrow">In motion</p><h2>A closer look.</h2><p>Around the Lamborghini during its foam wash.</p></div>
    <div className="work-videos">{[["detail-2282", "Lamborghini foam wash — front view"], ["detail-2278", "Lamborghini foam wash — walkaround"]].map(([file, caption]) => <figure key={file}><video controls playsInline preload="none" poster={`/work/${file}.jpg`} aria-label={caption}><source src={`/work/${file}.mp4`} type="video/mp4"/>Your browser does not support video. <a href={`/work/${file}.mp4`}>Open the video</a>.</video><figcaption>{caption}</figcaption></figure>)}</div>
    <div className="work-social-links"><a href="https://www.instagram.com/camotivedetailing/" target="_blank" rel="noopener noreferrer">More on Instagram</a><a href="https://www.tiktok.com/@camotivedetailing" target="_blank" rel="noopener noreferrer">Follow on TikTok</a></div>
  </section>;
}
