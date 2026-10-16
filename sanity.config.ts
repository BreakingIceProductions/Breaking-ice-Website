'use client'

import { visionTool } from '@sanity/vision'
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { portalSchemaTypes } from './src/sanity/portal/schema'
import { portalStructure } from './src/sanity/portal/structure'
import { apiVersion, dataset, projectId } from './src/sanity/env'
import { SINGLETONS, schemaTypes } from './src/sanity/schemaTypes'
import { structure } from './src/sanity/structure'

const singletonRules = (singletons: string[]) => ({
  schemaTemplates: (templates: { schemaType: string }[]) => templates.filter(({ schemaType }) => !singletons.includes(schemaType)),
  actions: (input: { action?: string }[], context: { schemaType: string }) =>
    singletons.includes(context.schemaType)
      ? input.filter(({ action }) => action && ['publish', 'discardChanges', 'restore'].includes(action))
      : input,
})

const site = singletonRules(SINGLETONS)
const portal = singletonRules(['portalSettings'])

/**
 * Two workspaces, switched from the top-left of the Studio:
 *   Website        /studio/website  public site content (dataset "production")
 *   Client portal  /studio/portal   private client projects (dataset "portal")
 */
export default defineConfig([
  {
    name: 'website',
    title: 'Website',
    subtitle: 'Breaking Ice',
    basePath: '/studio/website',
    projectId,
    dataset,
    schema: { types: schemaTypes, templates: site.schemaTemplates as never },
    document: { actions: site.actions as never },
    plugins: [structureTool({ structure }), visionTool({ defaultApiVersion: apiVersion })],
  },
  {
    name: 'portal',
    title: 'Client portal',
    subtitle: 'Private',
    basePath: '/studio/portal',
    projectId,
    dataset: 'portal',
    schema: { types: portalSchemaTypes, templates: portal.schemaTemplates as never },
    document: { actions: portal.actions as never },
    plugins: [structureTool({ structure: portalStructure })],
  },
])
