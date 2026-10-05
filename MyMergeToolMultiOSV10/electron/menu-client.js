popupHost.onHtml((html) => {
  const root = document.getElementById("root");
  root.innerHTML = html;
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    popupHost.action(button.dataset.action, {});
  });
});
