let images = [];
let order = [0, 1];
let submitted = false;

function render() {
  for (let position = 0; position < 2; position += 1) {
    const image = images[order[position]];
    document.querySelector(`#image-${position}`).src = image.preview;
    document.querySelector(`#name-${position}`).textContent = image.name;
  }
}

function swap() {
  if (images.length !== 2 || submitted) return;
  order.reverse();
  render();
}

function submit(choice) {
  if (submitted) return;
  submitted = true;
  window.pdfrootDesktop.chooseFrontBackOrder(choice);
}

document.querySelector("#swap").addEventListener("click", swap);
document.querySelector("#merge").addEventListener("click", () => {
  if (images.length === 2) submit(order.slice());
});
document.querySelector("#cancel").addEventListener("click", () => submit(null));
document.querySelector("#close-choice").addEventListener("click", () => submit(null));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") submit(null);
});

for (let position = 0; position < 2; position += 1) {
  const card = document.querySelector(`#slot-${position}`);
  card.addEventListener("dragstart", (event) => {
    if (images.length !== 2) { event.preventDefault(); return; }
    event.dataTransfer.setData("text/plain", String(position));
    event.dataTransfer.effectAllowed = "move";
  });
  card.addEventListener("dragover", (event) => { event.preventDefault(); card.classList.add("drag-over"); });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("drag-over");
    const source = event.dataTransfer.getData("text/plain");
    if ((source === "0" || source === "1") && source !== String(position)) swap();
  });
  let touchStartY;
  card.addEventListener("touchstart", (event) => { touchStartY = event.changedTouches[0]?.clientY; }, { passive: true });
  card.addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0]?.clientY - touchStartY;
    if (Number.isFinite(distance) && Math.abs(distance) > 55) swap();
  }, { passive: true });
}

window.pdfrootDesktop.onToolActivate(() => {
window.pdfrootDesktop.frontBackPreviews().then((result) => {
  if (!result || !Array.isArray(result.images) || result.images.length !== 2) {
    throw new Error(result?.error || "Could not load the two selected images.");
  }
  images = result.images;
  render();
  document.querySelector("#swap").disabled = false;
  document.querySelector("#merge").disabled = false;
}).catch((error) => {
  const status = document.querySelector("#error");
  status.textContent = String(error?.message || "Could not preview the images.");
  status.hidden = false;
  document.querySelector("#name-0").textContent = "Preview unavailable";
  document.querySelector("#name-1").textContent = "Preview unavailable";
});

});
