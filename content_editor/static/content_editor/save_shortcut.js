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

window.addEventListener("click", (e) => {
  let el
  if (
    (el = e.target.closest(".deletelink")) &&
    document.querySelectorAll("input[type=checkbox][name$=-DELETE]:checked")
      .length &&
    !confirm(
      "You have marked inline objects for deletion but have clicked the link to delete the whole object. Are you sure that's what you want? Use a save button to delete inline objects.",
    )
  ) {
    e.preventDefault()
  }
})
