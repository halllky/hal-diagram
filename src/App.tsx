import React, { useCallback, useEffect, useState, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import * as Icon from '@ant-design/icons'
import { Components, Messaging, ReactHookUtil, StorageUtil } from './util'
import { useDataSourceHandler, UnknownDataSource, IDataSourceHandler, DataSet } from './DataSource'
import { ViewState } from './Cy'
import { useTauriApi } from './TauriApi'
import GraphView, { GraphViewRef } from './GraphView'

function App() {
  const [, dispatchMessage] = Messaging.useMsgContext()
  const { loadTargetFile, saveTargetFile, saveViewStateFile, loadViewStateFile } = useTauriApi()

  const [dataSource, setDataSource] = useState<UnknownDataSource>()
  const [dsHandler, setDsHandler] = useState<IDataSourceHandler>()
  const { defineHandler } = useDataSourceHandler()
  const graphViewRef = useRef<GraphViewRef>(null)

  const [initialDataSetForGraph, setInitialDataSetForGraph] = useState<DataSet>()
  const [initialViewStateForGraph, setInitialViewStateForGraph] = useState<ViewState>()

  // -----------------------------------------------------
  // 読込
  const [nowLoading, setNowLoading] = useState(true)
  const reload = useCallback(async (source: UnknownDataSource) => {
    setNowLoading(true)
    try {
      const handler = defineHandler(source)
      const dataSet = await handler.reload(source)
      const viewState = await loadViewStateFile()
      setDataSource(source)
      setDsHandler(handler)
      setInitialDataSetForGraph(dataSet)
      setInitialViewStateForGraph(viewState)
    } catch (error) {
      dispatchMessage(msg => msg.error(error))
    } finally {
      setNowLoading(false)
    }
  }, [defineHandler, loadViewStateFile, dispatchMessage])
  const reloadByCurrentData = useCallback(async () => {
    if (dataSource) await reload(dataSource)
  }, [dataSource, reload])

  useEffect(() => {
    const timer = setTimeout(async () => {
      reload(await loadTargetFile())
    }, 500)
    return () => clearTimeout(timer)
  }, [reload])

  // -----------------------------------------------------
  // 保存
  const saveAll = useCallback(async () => {
    try {
      if (dataSource) await saveTargetFile(dataSource)
      const viewState = graphViewRef.current?.collectViewState()
      if (viewState) await saveViewStateFile(viewState)
      dispatchMessage(msg => msg.info('保存しました。'))
    } catch (error) {
      dispatchMessage(msg => msg.error(error))
    }
  }, [dataSource, saveTargetFile, saveViewStateFile, dispatchMessage])

  // -----------------------------------------------------
  // 表示/非表示
  const [showDataSource, setShowDataSource] = ReactHookUtil.useToggle(true)
  const [showExplorer, setShowExplorer] = ReactHookUtil.useToggle(true)

  // -----------------------------------------------------
  // キー操作
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = useCallback(e => {
    if (e.ctrlKey && e.key === 's') {
      saveAll()
      e.preventDefault()
    } else if (e.ctrlKey && e.key === 'a') {
      graphViewRef.current?.selectAll()
      e.preventDefault()
    } else if (e.key === 'Space' || e.key === ' ') {
      graphViewRef.current?.toggleExpandCollapse()
      e.preventDefault()
    }
  }, [saveAll])

  // -----------------------------------------------------
  // 選択中の要素のプロパティ
  const [detailJson, setDetailJson] = useState('')
  const updateDetailJson = useCallback(() => {
    const cy = graphViewRef.current?.getCy()
    if (!cy) {
      setDetailJson('')
      return
    }
    let str: string[] = []
    const selected = [...cy.nodes(':selected'), ...cy.edges(':selected')]
    if (selected.length >= 1) {
      const data = selected[0].data()
      let obj: {}
      if (data.source && data.target) {
        obj = {
          ...data,
          source: cy.$id(data.source).data(),
          target: cy.$id(data.target).data(),
        }
      } else {
        obj = data
      }
      str.push(JSON.stringify(obj, undefined, '  '))
    }
    if (selected.length >= 2) {
      str.push(`...ほか ${selected.length - 1} 件の選択`)
    }
    setDetailJson(str.join('\n'))
  }, [])

  const LayoutSelectorFromRef = graphViewRef.current?.LayoutSelector;
  const nodesLockedFromRef = graphViewRef.current?.getNodesLocked();

  return (
    <PanelGroup direction="horizontal" className="w-full h-full bg-zinc-200">

      {/* エクスプローラ */}
      <Panel defaultSize={16} className={`flex flex-col ${!showExplorer && 'hidden'}`}>
        <Components.Button onClick={updateDetailJson}>
          プロパティ
        </Components.Button>
        <span className="flex-1 whitespace-pre">
          {detailJson}
        </span>
      </Panel>

      <PanelResizeHandle className={`w-2 ${!showExplorer && 'hidden'}`} />

      <Panel className="flex flex-col">

        {/* ツールバー */}
        <div className="flex content-start items-center gap-2 p-1">
          <Components.Button
            onClick={() => setShowExplorer(x => x.toggle())}
            icon={Icon.MenuOutlined}
          />
          {dsHandler?.Editor && (
            <Components.Button
              onClick={() => setShowDataSource(x => x.toggle())}
              icon={showDataSource ? Icon.UpOutlined : Icon.DownOutlined}
            />)}
          <Components.Button outlined onClick={reloadByCurrentData}>
            {nowLoading ? '読込中...' : '再読込(Ctrl+Enter)'}
          </Components.Button>

          <div className="flex-1"></div>

          {LayoutSelectorFromRef && <LayoutSelectorFromRef />}
          <Components.Button outlined onClick={() => graphViewRef.current?.reset()}>自動レイアウト</Components.Button>

          <label className="text-nowrap flex gap-1">
            <input type="checkbox" checked={nodesLockedFromRef ?? false} onChange={() => graphViewRef.current?.toggleNodesLocked()} />
            ノード位置固定
          </label>

          <Components.Button outlined onClick={() => graphViewRef.current?.expandSelections()}>展開</Components.Button>
          <Components.Button outlined onClick={() => graphViewRef.current?.collapseSelections()}>折りたたむ</Components.Button>

          <Components.Button onClick={saveAll}>保存(Ctrl+S)</Components.Button>
        </div>

        <PanelGroup direction="vertical" className="flex-1">
          {/* データソース */}
          <Panel
            defaultSize={16}
            className={`flex flex-col ${!showDataSource && 'hidden'}`}>
            {dsHandler?.Editor && (
              <dsHandler.Editor
                value={dataSource}
                onChange={setDataSource}
                onReload={reloadByCurrentData}
                className="flex-1"
              />
            )}
          </Panel>

          <PanelResizeHandle className={`h-2 ${!showDataSource && 'hidden'}`} />

          {/* グラフ */}
          <Panel className="bg-white relative">
            <GraphView
              ref={graphViewRef}
              handleKeyDown={handleKeyDown}
              nowLoading={nowLoading}
              initialDataSet={initialDataSetForGraph}
              initialViewState={initialViewStateForGraph}
            />
          </Panel>

          <Messaging.InlineMessageList />
          <Messaging.Toast />
        </PanelGroup>
      </Panel>
    </PanelGroup>
  )
}


function AppWithContextProvider() {
  return (
    <Messaging.ErrorMessageContextProvider>
      <StorageUtil.LocalStorageContextProvider>
        <App />
      </StorageUtil.LocalStorageContextProvider>
    </Messaging.ErrorMessageContextProvider>
  )
}

export default AppWithContextProvider
