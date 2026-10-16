import type { StructureResolver } from 'sanity/structure'

export const portalStructure: StructureResolver = (S) =>
  S.list()
    .title('Client portal')
    .items([
      S.documentTypeListItem('clientProject').title('Client projects'),
      S.documentTypeListItem('client').title('Clients'),
      S.divider(),
      S.listItem()
        .title('Portal settings')
        .id('portalSettings')
        .child(S.document().schemaType('portalSettings').documentId('portalSettings').title('Portal settings')),
    ])
