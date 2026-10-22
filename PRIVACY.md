# Privacy policy — Azure DevOps Description Diff

Effective date: 22 October 2026. Publisher: dawiisss (K3to).

## Purpose and page content

The extension reads the Description and Acceptance Criteria revision content displayed in Azure DevOps Work Item History to show additions, deletions, and comparison views. This processing happens locally in your browser. Work-item content is held in memory while the page is open and is not saved to extension storage, uploaded to the publisher, sold, or used for advertising, analytics, AI training, or profiling. The extension does not change or save Azure DevOps work items.

## Sites and permissions

By default, the extension can run on HTTPS pages at dev.azure.com and subdomains of visualstudio.com. It checks the current page's URL/hostname and the browser's site permissions to decide whether to activate. It does not maintain a browsing-history log or track unrelated websites.

For a custom Azure DevOps Server or TFS site, you must request and approve access to that site in Options. Access is limited to the requested scheme and hostname; browser host permissions cover all ports and paths at that host. New entries request HTTP access only when an HTTP address is entered. Restoring an older wildcard-scheme or wildcard-host entry can request both schemes or subdomains, as shown in the browser prompt; remove and re-add a full HTTPS address to narrow such an entry. You may remove a configured site in Options or revoke its access in your browser's extension settings. Synced custom-site preferences do not grant access on a different device without a separate browser permission grant.

The `storage` permission saves preferences. The `scripting` permission registers and loads the extension's bundled code and styles on approved custom servers. There is no permission to read the browser's browsing-history database. No remotely hosted executable code is loaded.

## Preferences and browser sync

The extension stores whether it is enabled, the preferred comparison view, Focus Changes preference, and configured custom server patterns. Browser-managed extension sync storage is used when available, with local storage as a fallback. Those preferences, including internal server hostnames you enter, may sync through your browser account according to your browser's sync settings and provider policies. Description and Acceptance Criteria text is not stored in either storage area.

## Embedded resources and external links

Descriptions and Acceptance Criteria may contain images. Generated comparison views can load those images from their original servers, which can receive ordinary image requests and related network information. Existing Azure DevOps content can make similar requests independently. Clicking a link opens its destination under your browser's normal behavior. The extension does not upload the surrounding work-item text with an image request or link click. Browser-managed requests may include information such as IP addresses, cookies, or referrer headers, depending on the browser and destination.

## Clipboard

Clicking Copy writes the selected field's updated, sanitized plain text to your system clipboard. The extension does not read the clipboard or send its contents to the publisher. Clipboard retention and any clipboard managers are controlled by your operating system and other software.

## Retention and control

Page content and temporary comparison state are discarded when the page or extension context closes. Preferences remain until removed, reset, or cleared through your browser. Removing a custom site deletes its saved entry and revokes that site's optional browser grant where applicable. Browser-account sync retention is governed by your browser provider. Uninstalling removes the installed extension and its local data according to browser behavior.

## Third parties and support

There is no publisher-operated data collection or analytics service. Browser sync, Azure DevOps, original embedded-resource servers, and destinations you choose to visit operate under their own policies. The extension bundles DOMPurify locally to sanitize comparison content.

For privacy questions, contact the publisher through the project's GitHub issue tracker: https://github.com/dawiisss/azure-devops-description-diff/issues. Include only the minimum information needed; do not post private work-item text or confidential company details in a public issue.

## Changes

Material changes to this policy will be reflected in its effective date and the extension's release notes.
