import type { StructureResolver } from 'sanity/structure'

export const portalStructure: StructureResolver = (S) =>
  S.list()
    .title('Client portal')
    .items([
      S.documentTypeListItem('clientProject').title('Client projects'),
      S.documentTypeListItem('client').title('Clients'),
      S.listItem()
        .title('Retainers')
        .id('retainers')
        .child(
          S.list()
            .title('Retainers')
            .items([
              S.listItem()
                .title('Retainer clients')
                .id('retainerClients')
                .child(S.documentList().title('Retainer clients').schemaType('client').filter('_type == "client" && defined(retainer)')),
              S.documentTypeListItem('retainerMonth').title('Retainer months'),
            ]),
        ),
      S.documentTypeListItem('reviewComment').title('Review comments'),
      S.documentTypeListItem('docTemplate').title('Document templates'),
      S.documentTypeListItem('signRequest').title('Sign requests'),
      S.documentTypeListItem('sentEmail').title('Sent emails'),
      S.divider(),
      S.listItem()
        .title('Portal settings')
        .id('portalSettings')
        .child(S.document().schemaType('portalSettings').documentId('portalSettings').title('Portal settings')),
    ])
