import { isRealRegion, qs } from "content-editor/utils"

/*
 * CONTENT EDITOR CONTEXT
 *
 * Parses the JSON configuration emitted by the admin into the singleton
 * ``window.ContentEditor`` object and augments it with derived lookup maps and
 * the public ``addContent`` method. The subsystem classes hang their behavior
 * off this shared object rather than replacing it, so the public API
 * (``window.ContentEditor``, ``addContent``, ``addPluginButton``) keeps working
 * for third-party integrations.
 */
export function initContext() {
  const raw = document.getElementById("content-editor-context").textContent
  const ContentEditor = JSON.parse(raw)

  Object.assign(ContentEditor, {
    declaredRegions: [...ContentEditor.regions],
    pluginsByPrefix: Object.fromEntries(
      ContentEditor.plugins.map((plugin) => [plugin.prefix, plugin]),
    ),
    regionsByKey: Object.fromEntries(
      ContentEditor.regions.map((region) => [region.key, region]),
    ),
    hasSections: ContentEditor.plugins.some((plugin) => plugin.sections),

    addContent(prefix) {
      // Defense in depth: never add content without a valid target region, even
      // though the plugin buttons are also hidden in that case.
      if (!isRealRegion(ContentEditor, ContentEditor.currentRegion)) return
      const link = qs(`#${prefix}-group .add-row a`)
      if (link) link.click()
    },

    // Assigned by the Regions subsystem during initialization. Declared here so
    // the public API exists even before wiring completes.
    addPluginButton() {},
  })

  window.ContentEditor = ContentEditor
  return ContentEditor
}
