import React, { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithoutRef, TextareaHTMLAttributes, createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import * as UUID from 'uuid'

/** forwardRefの戻り値の型定義がややこしいので単純化するためのラッピング関数 */
export const forwardRefEx = <TRef, TProps>(
  fn: (props: TProps, ref: React.ForwardedRef<TRef>) => React.ReactNode
) => {
  return forwardRef(fn) as (
    (props: PropsWithoutRef<TProps> & { ref?: React.Ref<TRef> }) => React.ReactNode
  )
}

// --------------------------------------------------
// UIコンポーネント
export namespace Components {
  type InputWithLabelAttributes = {
    labelText?: string
    labelClassName?: string
    inputClassName?: string
  }
  export const Text = forwardRefEx<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & InputWithLabelAttributes>((props, ref) => {
    const {
      labelText,
      labelClassName,
      inputClassName,
      className,
      autoComplete,
      ...rest
    } = props
    return (
      <label className={`flex ${className}`}>
        {(labelText || labelClassName) && (
          <span className={`select-none ${labelClassName}`}>
            {labelText}
          </span>)}
        <input ref={ref} {...rest}
          className={`flex-1 border border-1 border-slate-400 px-1 ${inputClassName}`}
          autoComplete={autoComplete ?? 'off'}
        />
      </label>
    )
  })

  export const Textarea = forwardRefEx<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & InputWithLabelAttributes>((props, ref) => {
    const {
      className,
      spellCheck,
      labelText,
      labelClassName,
      inputClassName,
      ...rest
    } = props
    return (
      <label className={`flex ${className}`}>
        {(labelText || labelClassName) && (
          <span className={`select-none ${labelClassName}`}>
            {labelText}
          </span>)}
        <textarea ref={ref} {...rest}
          className={`flex-1 border border-1 border-slate-400 px-1 ${inputClassName}`}
          spellCheck={spellCheck ?? 'false'}
        ></textarea>
      </label>)
  })

  type ButtonAttrs = {
    submit?: boolean
  }
  export const Button = forwardRefEx<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & ButtonAttrs>((props, ref) => {
    const {
      type,
      submit,
      className,
      ...rest
    } = props
    return (
      <button ref={ref} {...rest}
        type={type ?? (submit ? 'submit' : 'button')}
        className={`text-white bg-slate-500
          px-1 text-nowrap
          border border-1 border-slate-700
          ${className}`}
      ></button>
    )
  })

  export const Separator = () => {
    return (
      <hr className="bg-slate-300 border-none h-[1px] m-2" />
    )
  }
}

// --------------------------------------------------
// 状態の型定義からreducer等の型定義をするのを簡略化するための仕組み
export namespace ReactHookUtil {
  // useReducerの簡略化
  type ReducerDef<S, M extends StateModifier<S>> = (state: S) => M
  type StateModifier<S> = { [action: string]: (...args: any[]) => S }
  type DispatchArg<S, M extends StateModifier<S>> = (modifier: M) => S
  export const defineReducer = <S, M extends StateModifier<S>>(
    reducerDef: ReducerDef<S, M>
  ): React.Reducer<S, DispatchArg<S, M>> => {
    return (state, action) => {
      const modifier = reducerDef(state)
      const newState = action(modifier)
      return newState
    }
  }

  // useContextの簡略化
  export const defineContextAndReducer = <S, M extends StateModifier<S>>(
    getInitialState: () => S,
    reducerDef: ReducerDef<S, M>
  ) => {
    const reducer = defineReducer(reducerDef)
    const useReducerEx = () => useReducer(reducer, getInitialState())
    const dummyDispatcher = (() => { }) as React.Dispatch<DispatchArg<S, M>>
    const context = createContext([getInitialState(), dummyDispatcher] as const)
    return [context, useReducerEx] as const
  }
}

// --------------------------------------------------
// ローカルストレージへの保存と復元
export namespace StorageUtil {
  export type DeserializeResult<T> = { ok: true, obj: T } | { ok: false }
  export type LocalStorageHandler<T> = {
    storageKey: string
    serialize: (obj: T) => string
    deserialize: (str: string) => DeserializeResult<T>
    defaultValue: () => T
  }

  // アプリ全体でローカルストレージのデータの更新タイミングを同期するための仕組み
  type LocalStorageData = { [storageKey: string]: unknown }
  const getInitialState = () => ({}) as LocalStorageData
  const [LocalStorageContext, useLocalStorageReducer] = ReactHookUtil.defineContextAndReducer(getInitialState, state => ({
    cache: <K extends keyof LocalStorageData>(key: K, value: LocalStorageData[K]) => {
      return { ...state, [key]: value }
    },
  }))
  export const LocalStorageContextProvider = ({ children }: {
    children?: React.ReactNode
  }) => {
    const contextValue = useLocalStorageReducer()
    return (
      <LocalStorageContext.Provider value={contextValue}>
        {children}
      </LocalStorageContext.Provider>
    )
  }

  export const useLocalStorage = <T,>(handler: LocalStorageHandler<T>) => {
    const [dataSet, dispatch] = useContext(LocalStorageContext)
    const data: T = useMemo(() => {
      const cachedData = dataSet[handler.storageKey] as T | undefined
      return cachedData ?? handler.defaultValue()
    }, [dataSet[handler.storageKey], handler.defaultValue])

    useEffect(() => {
      // 初期表示時、LocalStorageの値をキャッシュに読み込む
      const serialized = localStorage.getItem(handler.storageKey)
      if (serialized == null) return
      const deserialized = handler.deserialize(serialized)
      if (!deserialized.ok) {
        // 保存されているが型が不正な場合
        console.warn(`Failuer to parse local storage value as '${handler.storageKey}'.`)
        return
      }
      dispatch(state => state.cache(handler.storageKey, deserialized.obj))
    }, [handler])

    const save = useCallback((value: T) => {
      const serialized = handler.serialize(value)
      localStorage.setItem(handler.storageKey, serialized)
      dispatch(state => state.cache(handler.storageKey, value))
    }, [handler])

    return { data, save }
  }
}

// ------------------- 木構造データの操作 --------------------
export namespace Tree {
  export type TreeNode<T> = {
    item: T
    children: TreeNode<T>[]
    parent?: TreeNode<T>
    depth: number
  }

  type ToTreeArgs<T>
    = { getId: (item: T) => string, getParent: (item: T) => string | null | undefined, getChildren?: undefined }
    | { getId: (item: T) => string, getParent?: undefined, getChildren: (item: T) => T[] | null | undefined }
  export const toTree = <T,>(items: T[], fn: ToTreeArgs<T>): TreeNode<T>[] => {
    const treeNodes = new Map<string, TreeNode<T>>(items
      .map(item => [
        fn.getId(item),
        { item, children: [], depth: -1 }
      ]))
    // 親子マッピング
    if (fn.getParent) {
      for (const node of treeNodes) {
        const parentId = fn.getParent(node[1].item)
        if (parentId == null) continue
        const parent = treeNodes.get(parentId)
        node[1].parent = parent
        parent?.children.push(node[1])
      }
      for (const node of treeNodes) {
        node[1].depth = getDepth(node[1])
      }
    } else {
      const createChildrenRecursively = (parent: TreeNode<T>): void => {
        const childrenItems = fn.getChildren(parent.item) ?? []
        for (const childItem of childrenItems) {
          const childNode: TreeNode<T> = {
            item: childItem,
            depth: parent.depth + 1,
            parent,
            children: [],
          }
          parent.children.push(childNode)
          createChildrenRecursively(childNode)
        }
      }
      for (const node of treeNodes) {
        node[1].depth = 0
        createChildrenRecursively(node[1])
      }
    }
    // ルートのみ返す
    return Array
      .from(treeNodes.values())
      .filter(node => node.depth === 0)
  }

  export const getAncestors = <T,>(node: TreeNode<T>): TreeNode<T>[] => {
    const arr: TreeNode<T>[] = []
    let parent = node.parent
    while (parent) {
      arr.push(parent)
      parent = parent.parent
    }
    return arr.reverse()
  }
  export const flatten = <T,>(nodes: TreeNode<T>[]): TreeNode<T>[] => {
    return nodes.flatMap(node => getDescendantsAndSelf(node))
  }
  export const getDescendantsAndSelf = <T,>(node: TreeNode<T>): TreeNode<T>[] => {
    return [node, ...getDescendants(node)]
  }
  export const getDescendants = <T,>(node: TreeNode<T>): TreeNode<T>[] => {
    const arr: TreeNode<T>[] = []
    const pushRecursively = (n: TreeNode<T>): void => {
      for (const child of n.children) {
        arr.push(child)
        pushRecursively(child)
      }
    }
    pushRecursively(node)
    return arr
  }
  export const getDepth = <T,>(node: TreeNode<T>): number => {
    return getAncestors(node).length
  }
}

// ------------------- エラーハンドリング --------------------
export namespace ErrorHandling {
  type ErrMsg = { id: string, name?: string, message: string, type: 'error' | 'warn' }
  const getInitialState = () => ({ errorMessages: [] as ErrMsg[] })
  const [ErrorMessageContext, useErrMsgReducer] = ReactHookUtil.defineContextAndReducer(getInitialState, state => ({
    add: (type: ErrMsg['type'], ...messages: unknown[]) => {
      const flatten = messages.flatMap(m => Array.isArray(m) ? m : [m])
      const addedMessages = flatten.map<ErrMsg>(m => {
        const id = UUID.v4()
        if (typeof m === 'string') return { id, type, message: m }
        const asErrMsg = m as Omit<ErrMsg, 'id'>
        if (typeof asErrMsg.message === 'string') return { id, type, message: asErrMsg.message, name: asErrMsg.name }
        return { id, type, message: m?.toString() ?? '' }
      })
      return { errorMessages: [...state.errorMessages, ...addedMessages] }
    },
    clear: (nameOrItem?: string | ErrMsg) => {
      if (!nameOrItem) {
        return { errorMessages: [] }
      } else if (typeof nameOrItem === 'string') {
        const name = nameOrItem
        return { errorMessages: state.errorMessages.filter(m => !m.name?.startsWith(name)) }
      } else {
        const id = nameOrItem.id
        return { errorMessages: state.errorMessages.filter(m => m.id !== id) }
      }
    },
  }))

  export const useMsgContext = () => useContext(ErrorMessageContext)
  export const ErrorMessageContextProvider = ({ children }: {
    children?: React.ReactNode
  }) => {
    const contextValue = useErrMsgReducer()

    return (
      <ErrorMessageContext.Provider value={contextValue}>
        {children}
      </ErrorMessageContext.Provider>
    )
  }
  export const MessageList = ({ filter, className }: {
    filter?: string
    className?: string
  }) => {
    const [{ errorMessages }, dispatch] = useMsgContext()
    const filtered = useMemo(() => {
      return filter
        ? errorMessages.filter(m => m.name?.startsWith(filter))
        : errorMessages
    }, [errorMessages, filter])

    return (
      <ul className={`flex flex-col ${className}`}>
        {filtered.map(msg => (
          <li key={msg.id} className={`
            flex gap-1 items-center
            border border-1
            ${msg.type === 'warn' ? 'border-amber-200' : 'border-rose-200'}
            ${msg.type === 'warn' ? 'bg-amber-100' : 'bg-rose-100'}`}>
            <span title={msg.message} className={`
              flex-1
              ${msg.type === 'warn' ? 'text-amber-700' : 'text-rose-600'}
              overflow-hidden text-nowrap overflow-ellipsis
              select-all`}>
              {msg.message}
            </span>
            <Components.Button
              onClick={() => dispatch(state => state.clear(msg))}
            >×</Components.Button>
          </li>
        ))}
      </ul>
    )
  }
}
