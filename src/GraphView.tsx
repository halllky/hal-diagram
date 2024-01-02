import React, { useCallback, useEffect, useState } from 'react'
import cytoscape from 'cytoscape'
import ExpandCollapse from './GraphView.ExpandCollapse'
import { Toolbar } from './GraphView.ToolBar'
import Navigator from './GraphView.Navigator'
import Layout from './GraphView.Layout'
// import enumerateData from './data'
import { Components, ContextUtil, StorageUtil } from './util'
import { useNeo4jQueryRunner } from './GraphView.Neo4j'
import * as UUID from 'uuid'
import { useParams } from 'react-router-dom'

Layout.configure(cytoscape)
Navigator.configure(cytoscape)
ExpandCollapse.configure(cytoscape)

const Page = () => {
  // query editing
  const { queryId } = useParams()
  const [displayedQuery, setDisplayedQuery] = useState(() => createNewQuery())
  const handleQueryStringEdit: React.ChangeEventHandler<HTMLTextAreaElement> = useCallback(e => {
    setDisplayedQuery({
      ...displayedQuery,
      queryString: e.target.value,
    })
  }, [displayedQuery])

  // Neo4j
  const { load } = StorageUtil.useLocalStorage(queriesSerializer)
  const { runQuery, queryResult, nowLoading } = useNeo4jQueryRunner()
  useEffect(() => {
    // 画面表示時、保存されているクエリ定義を取得しクエリ実行
    if (!queryId) return
    const queries = load()
    if (!queries.ok) return
    const loaded = queries.obj.find(q => q.queryId === queryId)
    if (!loaded) return
    setDisplayedQuery(loaded)
    runQuery(loaded.queryString)
  }, [queryId, load, runQuery])
  const handleQueryRerun = useCallback(() => {
    if (nowLoading) return
    runQuery(displayedQuery.queryString)
  }, [displayedQuery.queryString, nowLoading])

  // Cytoscape
  const [{ cy, elements }, dispatch] = useGraphContext()
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    dispatch({ update: 'elements', value: queryResult })
  }, [queryResult])
  const divRef = useCallback((divElement: HTMLDivElement | null) => {
    if (!divElement) return
    const cyInstance = cytoscape({
      container: divElement,
      elements,
      style: STYLESHEET,
      layout: Layout.DEFAULT,
    })
    Navigator.setupCyInstance(cyInstance)
    ExpandCollapse.setupCyInstance(cyInstance)
    dispatch({ update: 'cy', value: cyInstance })
    if (!initialized) {
      cyInstance.resize().fit().reset()
      setInitialized(true)
    }
  }, [elements, initialized, dispatch])

  return (
    <div className="flex flex-col relative">
      <Components.Textarea value={displayedQuery.queryString} onChange={handleQueryStringEdit} />
      <Components.Button onClick={handleQueryRerun} className="self-end">
        {nowLoading ? '読込中...' : '読込'}
      </Components.Button>
      <Components.Separator />
      <Toolbar cy={cy} className="mb-1" />
      <div ref={divRef} className="
        overflow-hidden [&>div>canvas]:left-0
        flex-1
        border border-1 border-slate-400">
      </div>
      <Navigator.Component className="absolute w-1/4 h-1/4 right-6 bottom-6 z-[200]" />
    </div>
  )
}

const STYLESHEET: cytoscape.CytoscapeOptions['style'] = [{
  selector: 'node',
  css: {
    'shape': 'round-rectangle',
    'width': (node: any) => node.data('label')?.length * 10,
    'text-valign': 'center',
    'text-halign': 'center',
    'border-width': '1px',
    'border-color': '#909090',
    'background-color': '#666666',
    'background-opacity': .1,
    'label': 'data(label)',
  },
}, {
  selector: 'node:parent', // 子要素をもつノードに適用される
  css: {
    'text-valign': 'top',
    'color': '#707070',
  },
}, {
  selector: 'edge',
  style: {
    'target-arrow-shape': 'triangle',
    'curve-style': 'bezier',
  },
}, {
  selector: 'edge:selected',
  style: {
    'label': 'data(label)',
    'color': 'blue',
  },
}]

// ------------------------------------------------------
export type Query = {
  queryId: string
  name: string
  queryString: string
}
const createNewQuery = (): Query => ({
  queryId: UUID.v4(),
  name: '',
  queryString: '',
})

const queriesSerializer: StorageUtil.Serializer<Query[]> = {
  storageKey: 'HALDIAGRAM::QUERIES',
  serialize: obj => {
    return JSON.stringify(obj)
  },
  deserialize: str => {
    try {
      const parsed: Partial<Query>[] = JSON.parse(str)
      if (!Array.isArray(parsed)) return { ok: false }
      const obj = parsed.map<Query>(item => ({
        queryId: item.queryId ?? '',
        name: item.name ?? '',
        queryString: item.queryString ?? '',
      }))
      return { ok: true, obj }
    } catch (error) {
      console.error(`Failure to load application settings.`, error)
      return { ok: false }
    }
  },
}

// ------------------- Context(TreeExplorerで使うために必要) -----------------------
type GraphViewState = {
  cy: cytoscape.Core | undefined
  elements: cytoscape.ElementDefinition[]
}
const getEmptyGraphViewState = (): GraphViewState => ({
  cy: undefined,
  elements: [],
})
const GraphViewContext = ContextUtil.createContextEx(getEmptyGraphViewState())
const useGraphContext = () => ContextUtil.useContextEx(GraphViewContext)

const ContextProvider = ({ children }: {
  children?: React.ReactNode
}) => {
  const reducerValue = ContextUtil.useReducerEx(getEmptyGraphViewState())
  return (
    <GraphViewContext.Provider value={reducerValue}>
      {children}
    </GraphViewContext.Provider>
  )
}

export default {
  Page,
  ContextProvider,
  createNewQuery,
  useGraphContext,
}