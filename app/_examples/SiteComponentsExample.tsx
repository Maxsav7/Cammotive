"use client";
// Preview of the reusable site components with Camotive's own data: package copy from
// Site.tsx, prices from the booking catalog, photos from the work gallery. Private
// folder, so not a route: render <SiteComponentsExample /> inside .site-shell to see it.
import { PackagePicker, type PickerPackage } from "@/components/site/package-picker";
import { WorkReel, type ReelItem } from "@/components/site/work-reel";
import { Button } from "@/components/ui/button";
import { bookablePackages } from "@/lib/booking-catalog";
import { packages } from "../Site";
import { photos } from "../WorkGallery";
import Link from "next/link";

const detailing: PickerPackage[] = bookablePackages.map(id => ({
  id,
  ...packages[id],
  featuredLabel: id === "premium" ? "Deep clean + protection" : undefined,
}));

const featuredWork = ["mach-e-front", "mclaren-hero", "mclaren-interior", "maverick-front", "lamborghini-foam", "tundra-cabin", "mercedes-cla-rear", "mercedes-wheel"];
const work: ReelItem[] = featuredWork.flatMap(file => {
  const photo = photos.find(([name]) => name === file);
  return photo ? [{ src: `/work/${photo[0]}.jpg`, alt: photo[1], caption: photo[1], tag: photo[2] }] : [];
});

export default function SiteComponentsExample() {
  return (
    <>
      <section className="section" aria-labelledby="picker-heading">
        <div className="section-heading">
          <h2 id="picker-heading">Pick your vehicle. See your price.</h2>
          <p>Mobile detailing at your home or office across San Antonio. Final pricing is confirmed before work begins.</p>
        </div>
        <PackagePicker packages={detailing} />
      </section>

      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="reel-heading">
        <WorkReel
          items={work}
          label="Recent work photos"
          heading={
            <div className="flex flex-col gap-3">
              <h2 id="reel-heading">Recent work</h2>
              <Button asChild variant="link" className="h-auto w-fit p-0 text-[15px] font-semibold text-foreground underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] underline-offset-[6px] hover:decoration-current">
                <Link href="/our-work">See the full gallery</Link>
              </Button>
            </div>
          }
        />
      </section>
    </>
  );
}
