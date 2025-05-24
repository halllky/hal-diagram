import { IDataSourceHandler } from "./GraphView/DataSource"
import { useFileDataSource } from "./DataSource.File"
import { UnknownDataSource } from "./GraphView/DataSource"
import { useCallback } from "react"
import { useNeo4jDataSource } from "./DataSource.Neo4j"

const DefaultHandler: IDataSourceHandler = {
  match: () => true,
  Editor: () => <div></div>,
  reload: async () => ({
    nodes: {},
    edges: [],
  }),
}

export const useDataSourceHandler = () => {

  const fileDataSetHandler = useFileDataSource()
  const neo4jHandler = useNeo4jDataSource()
  const defineHandler = useCallback((dataSource: UnknownDataSource): IDataSourceHandler => {
    return [
      fileDataSetHandler,
      neo4jHandler,
      DefaultHandler,
    ].find(h => h.match(dataSource?.type))!
  }, [fileDataSetHandler, neo4jHandler])

  return { defineHandler }
}