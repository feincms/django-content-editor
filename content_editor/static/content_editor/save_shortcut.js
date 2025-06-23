window.addEventListener("keydown", (e) => {
  let el
  if (
    e.key === "s" &&
    (e.metaKey || e.ctrlKey) &&
    (el = document.querySelector("form input[name=_continue]"))
  ) {
    e.preventDefault()
    el.click()
  }
})
