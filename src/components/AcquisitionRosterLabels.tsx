"use client";

import { useEffect } from "react";

const replacements = new Map([
  ["4 acquisition reps + 2 deals-only", "3 acquisition reps + 2 deals-only"],
  ["Only the four Acquisition reps have activities. Fadi and Faizan are shown as deals-only.", "Only the three Acquisition reps have activities. Fadi and Faizan are shown as deals-only."],
  ["Activity metrics apply only to Ursula, Zein, Ahmad and Mohammed Khalid. Fadi and Faizan are deals-only.", "Activity metrics apply only to Ursula, Zein and Mohammad Jehad. Fadi and Faizan are deals-only."],
  ["Current open deal value for the six approved owners.", "Current open deal value for the five approved owners."],
]);

function syncRosterLabels() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const current = node.textContent ?? "";
    let next = current;
    for (const [from, to] of replacements) next = next.replace(from, to);
    if (next !== current) node.textContent = next;
    node = walker.nextNode();
  }
}

export function AcquisitionRosterLabels() {
  useEffect(() => {
    syncRosterLabels();
    const observer = new MutationObserver(syncRosterLabels);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
