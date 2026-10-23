let mode;
const title = document.querySelector("#title");
const description = document.querySelector("#description");
const label = document.querySelector("#field-label");
const container = document.querySelector("#field-container");
const hint = document.querySelector("#hint");
const error = document.querySelector("#error");

const kinds = {
  ssc: [["photo", "Photo"], ["signature", "Signature"]],
  ibps: [["photo", "Photo"], ["signature", "Signature"], ["thumb", "Thumb impression"], ["declaration", "Declaration"]],
  upsc: [["photo", "Photo"], ["signature", "Signature"]],
};

function todayOnThisComputer() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

let input;
window.pdfrootDesktop.onToolActivate((query) => {
mode = query.mode;
if (mode === "kb") {
  title.textContent = "Resize to Exact KB";
  label.textContent = "Target size (KB)";
  hint.textContent = "Whole number from 5 to 2048 KB. Press Enter to create.";
  input = document.createElement("input");
  input.type = "number";
  input.min = "5";
  input.max = "2048";
  input.step = "1";
  input.value = "50";
} else if (mode === "ojas" || mode === "gpsc") {
  title.textContent = `${mode.toUpperCase()} Photo Resize`;
  label.textContent = "Date to print on the photo";
  hint.textContent = "Today's date is selected. Change it or leave it as shown.";
  input = document.createElement("input");
  input.type = "date";
  input.value = todayOnThisComputer();
} else if (Object.hasOwn(kinds, mode)) {
  title.textContent = `${mode.toUpperCase()} Image Resize`;
  label.textContent = "Selected image is a";
  hint.textContent = "Check the final file against your current application notice.";
  input = document.createElement("select");
  for (const [value, name] of kinds[mode]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = name;
    input.append(option);
  }
} else {
  window.pdfrootDesktop.chooseImageSetting(null);
}
if (input) {
  input.id = "choice-value";
  input.setAttribute("aria-label", label.textContent);
  container.append(input);
  input.focus(); if (mode === "kb") input.select();
}

});

function cancel() { window.pdfrootDesktop.chooseImageSetting(null); }
document.querySelector("#cancel").addEventListener("click", cancel);
document.querySelector("#cancel-top").addEventListener("click", cancel);
document.querySelector("#choice-form").addEventListener("submit", (event) => {
  event.preventDefault();
  error.hidden = true;
  if (mode === "kb" && (!Number.isInteger(Number(input.value)) || Number(input.value) < 5 || Number(input.value) > 2048)) {
    error.textContent = "Enter a whole number from 5 to 2048 KB.";
    error.hidden = false;
    return;
  }
  if (mode === "kb") window.pdfrootDesktop.chooseImageSetting({ type: "kb", value: Number(input.value) });
  else if (mode === "ojas" || mode === "gpsc") window.pdfrootDesktop.chooseImageSetting({ type: "date", value: input.value || todayOnThisComputer() });
  else window.pdfrootDesktop.chooseImageSetting({ type: "kind", value: input.value });
});
window.addEventListener("keydown", (event) => { if (event.key === "Escape") cancel(); });
