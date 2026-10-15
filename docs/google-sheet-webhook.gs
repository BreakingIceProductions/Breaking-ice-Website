/**
 * Google Apps Script: appends each website enquiry as a row in a Google Sheet.
 *
 * Setup (about 5 minutes, signed in as josh@breakingiceproductions.com):
 * 1. Create a Google Sheet called "Website enquiries".
 * 2. Extensions → Apps Script. Replace everything with this file. Save.
 * 3. Project Settings → Script properties → add SECRET with any long random value.
 * 4. Deploy → New deployment → type "Web app".
 *      Execute as: Me.   Who has access: Anyone.
 *    Copy the web app URL.
 * 5. In Vercel → Project → Settings → Environment Variables add:
 *      SHEET_WEBHOOK_URL    = the web app URL
 *      SHEET_WEBHOOK_SECRET = the same SECRET value
 *    then redeploy.
 */

const HEADERS = ['Received', 'Name', 'Email', 'Organization', 'Needs', 'Budget', 'Timeline', 'Heard about us', 'Story', 'Page', 'Status']

function doPost(e) {
  const data = JSON.parse(e.postData.contents)
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET') || ''
  if (secret && data.secret !== secret) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false })).setMimeType(ContentService.MimeType.JSON)
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS)
    sheet.setFrozenRows(1)
  }
  sheet.appendRow([
    new Date(data.received || Date.now()),
    data.name, data.email, data.organization, data.type, data.budget,
    data.timeline, data.heard, data.story, data.page, 'New',
  ])
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON)
}
