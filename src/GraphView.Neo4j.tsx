import { useCallback, useMemo, useState } from 'react'
import neo4j, { Node, Relationship, Record } from 'neo4j-driver'
import cytoscape from 'cytoscape'
import { useStoredSettings } from './appSetting'

export const useNeo4jQueryRunner = () => {
  const { setting } = useStoredSettings()
  const driver = useMemo(() => {
    if (!setting.activeNeo4jServerId) return null
    const serverConfig = setting.neo4jServer.find(x => x.uniqueId === setting.activeNeo4jServerId)
    if (!serverConfig) return null
    return neo4j.driver(serverConfig.url, neo4j.auth.basic(serverConfig.user, serverConfig.pass))
  }, [setting])

  const [nowLoading, setNowLoading] = useState(false)
  const [queryResult, setLoadedData] = useState<cytoscape.ElementDefinition[]>(() => [])
  const runQuery = useCallback(async (queryString: string) => {
    if (!driver) return
    const session = driver.session({ defaultAccessMode: neo4j.session.READ })
    const elements: { [id: string]: cytoscape.ElementDefinition } = {}
    const parentChildMap: { [child: string]: string } = {}
    setNowLoading(true)
    session.run(queryString).subscribe({
      onNext: record => neo4jQueryReusltToCytoscapeItem(record, elements, parentChildMap),
      onError: err => {
        console.error(err)
        setNowLoading(false)
      },
      onCompleted: async (summary) => {
        console.debug(summary)
        for (const node of Object.entries(elements)) {
          node[1].data.parent = parentChildMap[node[0]]
        }
        setLoadedData(Object.values(elements))
        setNowLoading(false)
        await session.close()
      },
    })
  }, [driver])
  return { runQuery, queryResult, nowLoading }
}

/** ノードがこの名前のプロパティを持つ場合は表示名称に使われる */
const NAME = 'name'
/** リレーションシップのtypeがこの値か否かで処理が変わる */
const CHILD = 'HAS_CHILD'

const neo4jQueryReusltToCytoscapeItem = (
  record: Record,
  elements: { [id: string]: cytoscape.ElementDefinition },
  parentChildMap: { [child: string]: string }
): void => {
  const parseValue = (value: any) => {
    if (value instanceof Relationship && value.type === CHILD) {
      parentChildMap[value.endNodeElementId] = value.startNodeElementId

    } else if (value instanceof Relationship) {
      const id = value.elementId
      const label = value.properties[NAME] ?? value.type
      const source = value.startNodeElementId
      const target = value.endNodeElementId
      elements[value.elementId] = { data: { id, label, source, target } }

    } else if (value instanceof Node) {
      const id = value.elementId
      const label = value.properties[NAME] ?? value.elementId
      elements[value.elementId] = { data: { id, label } }

    } else {
      console.warn('Failure to handle qurey result.', record)
    }
  }
  for (const key of record.keys) {
    const value = record.get(key)
    if (Array.isArray(value)) {
      for (const arrayElement of value) parseValue(arrayElement)
    } else {
      parseValue(value)
    }
  }
}
