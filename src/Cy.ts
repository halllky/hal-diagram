import { useCallback, useState } from 'react'
import cytoscape from 'cytoscape'
import * as UUID from 'uuid'
import Navigator from './Cy.Navigator'
import AutoLayout from './Cy.AutoLayout'
import * as ExpandCollapse from './Cy.ExpandCollapse'
import { ViewState, useViewState } from './Cy.SaveLoad'
import * as DS from './DataSource'
import { ReactHookUtil } from './util'
import { USER_SETTING } from './UserSetting'

AutoLayout.configure(cytoscape)
Navigator.configure(cytoscape)

export const useCytoscape = () => {
  const [cy, setCy] = useState<cytoscape.Core>()
  const [navInstance, setNavInstance] = useState<{ destroy: () => void }>()

  const containerRef = useCallback((divElement: HTMLElement | null) => {
    if (!cy && divElement) {
      // 初期化
      const cyInstance = cytoscape({
        container: divElement,
        elements: [],
        style: STYLESHEET,
        layout: AutoLayout.DEFAULT,
        wheelSensitivity: USER_SETTING.wheelSensitivity.value,
      })
      setNavInstance(Navigator.setupCyInstance(cyInstance))

      // Cytoscapeは標準でcanvas要素のmousedownでフォーカスを外す処理をしており
      // これによりcanvasを操作しているときにキーボードショートカットが使えないため
      // 無理やり再フォーカスさせてkeydownがトリガーされるようにする。
      cyInstance.on('mousedown', () => {
        divElement.focus()
      })

      setCy(cyInstance)

    } else if (cy && !divElement) {
      // 破棄
      navInstance?.destroy()
    }
  }, [cy, navInstance])

  const { autoLayout, LayoutSelector } = AutoLayout.useAutoLayout(cy)
  const expandCollapseActions = ExpandCollapse.useExpandCollapse(cy)

  const selectAll = useCallback(() => {
    cy?.nodes().select()
  }, [cy])

  // ノード位置固定
  const [nodesLocked, changeNodesLocked] = ReactHookUtil.useToggle()
  const toggleNodesLocked = useCallback(() => {
    if (!cy) { changeNodesLocked(x => x.setValue(false)); return }
    changeNodesLocked(x => x.toggle())
    cy.autolock(!nodesLocked)
  }, [cy, nodesLocked])

  const reset = useCallback(() => {
    autoLayout()
  }, [autoLayout])

  const { collectViewState, applyViewState } = useViewState(cy)

  const applyToCytoscape = useCallback(async (dataSet: DS.DataSet, viewState: ViewState) => {
    if (!cy) return
    try {
      cy.startBatch()

      // データ洗い替え前のノード位置などを退避させておく
      const viewStateBeforeQuery = collectViewState()

      cy.elements().remove()

      const nodeIds = new Set(Object.keys(dataSet.nodes))

      // 結果セット中に存在しないノードは仮ノードを作成して表示する
      const ensureNodeExists = (id: string) => {
        if (nodeIds.has(id)) return
        nodeIds.add(id)
        const label = id
        cy.add({ data: { id, label } })
      }

      // ノード
      // 以下の理由により親から順番に追加する必要がある
      // - parentはaddのタイミングでのみ設定でき、不変
      // - addのタイミングで親ノードがグラフ中に存在しない場合、自動的にundefinedになる
      const nodesWithDepth = Object.entries(dataSet.nodes).reduce((arr, [id, node]) => {
        let depth = 0
        let parentId = node.parent
        while (parentId) {
          const parent = dataSet.nodes[parentId]
          if (!parent) break // 親のIDは指定されているがグラフ中に存在しない場合
          depth++
          parentId = parent.parent
        }
        arr.push({ id, node, depth })
        return arr
      }, [] as { id: string, node: DS.Node, depth: number }[])

      nodesWithDepth.sort((a, b) => {
        if (a.depth < b.depth) return -1
        if (a.depth > b.depth) return 1
        return 0
      })

      for (const { id, node } of nodesWithDepth) {
        if (node.parent) ensureNodeExists(node.parent)
        const label = node.label
        const parent = node.parent
        cy.add({ data: { id, label, parent } })
      }

      // エッジ
      for (const { source, target, label } of dataSet.edges) {
        ensureNodeExists(source)
        ensureNodeExists(target)

        const id = UUID.v4()
        cy.add({ data: { id, source, target, label } })
      }

      // ノード位置などViewStateの復元
      applyViewState(viewState)
      applyViewState(viewStateBeforeQuery)

    } finally {
      cy.endBatch()
    }
  }, [cy, collectViewState, applyViewState])

  return {
    containerRef,
    applyToCytoscape,
    selectAll,
    reset,
    ...expandCollapseActions,
    LayoutSelector,
    nodesLocked,
    toggleNodesLocked,
    hasNoElements: (cy?.elements().length ?? 0) === 0,
    collectViewState,
  }
}

const STYLESHEET: cytoscape.CytoscapeOptions['style'] = [{
  selector: 'node',
  css: {
    'shape': 'rectangle',
    'width': (node: any) => node.data('label')?.length * 10,
    'text-valign': 'center',
    'text-halign': 'center',
    'border-width': '1px',
    'border-color': '#909090',
    'background-color': '#666666',
    'border-opacity': .5,
    'background-opacity': .1,
    'label': 'data(label)',
  },
}, {
  selector: 'node:selected',
  style: {
    'border-color': '#FF4F02',
    'border-opacity': 1,
    'border-width': '2px',
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
    'width': '1px',
  },
}, {
  selector: 'edge:selected',
  style: {
    'label': 'data(label)',
    'color': '#FF4F02',
    'line-color': '#FF4F02',
    'source-arrow-color': '#FF4F02',
    'target-arrow-color': '#FF4F02',
    'width': '2px',
  },
}]
