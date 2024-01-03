import { useCallback, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import * as UUID from 'uuid'
import { Components, StorageUtil } from './util'
import * as SideMenu from './appSideMenu'
import { Route } from 'react-router-dom'

export const usePages: SideMenu.UsePagesHook = () => {
  const menuItems = useMemo((): SideMenu.SideMenuSection[] => {
    return [{ url: '/settings', itemId: 'APP::SETTING', label: '設定', order: 999 }]
  }, [])
  const Routes = useCallback((): React.ReactNode => (
    <Route path="/settings" element={<AppSettingPage />} />
  ), [])
  return { menuItems, Routes }
}

// -------------------------------------
export type StoredSetting = {
  activeNeo4jServerId: string | undefined
  neo4jServer: {
    uniqueId: string
    name: string
    url: string
    user: string
    pass: string
  }[]
}

export const useStoredSettings = () => {
  const { data, save } = StorageUtil.useLocalStorage<StoredSetting>(() => ({
    storageKey: 'HALDIAGRAM::SETTINGS',
    defaultValue: () => ({
      activeNeo4jServerId: undefined,
      neo4jServer: [],
    }),
    serialize: obj => JSON.stringify(obj),
    deserialize: json => {
      const parsed: Partial<StoredSetting> = JSON.parse(json)
      const obj: StoredSetting = {
        activeNeo4jServerId: parsed.activeNeo4jServerId,
        neo4jServer: parsed.neo4jServer ?? [],
      }
      return { ok: true, obj }
    },
  }))
  return { setting: data, saveSetting: save }
}

export const AppSettingPage = () => {
  const { setting, saveSetting } = useStoredSettings()
  const { register, watch, setValue, control, handleSubmit } = useForm<StoredSetting>({
    defaultValues: setting,
  })

  // サーバー接続設定の配列
  const { fields, append, remove } = useFieldArray<StoredSetting>({ name: 'neo4jServer', control })
  const handleAppendServer = useCallback(() => {
    append({ uniqueId: UUID.v4(), name: '', url: '', user: '', pass: '' })
  }, [append])

  return (
    <form
      onSubmit={handleSubmit(saveSetting)}
      className="flex flex-col justify-start"
    >
      <div className="flex">
        <span className="basis-24">
          Neo4jサーバー<br />
          <Components.Button onClick={handleAppendServer}>追加</Components.Button>
        </span>
        <ul className="flex flex-col gap-3 items-stretch flex-1">
          {fields.map((server, ix) => (
            <li key={server.uniqueId} className="flex flex-col gap-1">
              <div className="flex items-center">
                <input
                  type="radio"
                  name="appsettings::active-db"
                  checked={server.uniqueId === watch('activeNeo4jServerId')}
                  onChange={() => setValue('activeNeo4jServerId', server.uniqueId)}
                  className="w-8 h-4"
                />
                <Components.Text type="text" className="flex-1" placeholder={`接続設定${ix + 1}`}
                  {...register(`neo4jServer.${ix}.name`)}
                />
                <Components.Button onClick={() => remove(ix)} className="ml-1">
                  削除
                </Components.Button>
              </div>
              <Components.Text type="url" labelText="URL" labelClassName="ml-8 basis-24" placeholder="neo4j://localhost:7687"
                {...register(`neo4jServer.${ix}.url`)}
              />
              <Components.Text type="text" labelText="USER" labelClassName="ml-8 basis-24" placeholder="neo4j"
                {...register(`neo4jServer.${ix}.user`)}
              />
              <Components.Text type="password" labelText="PASSWORD" labelClassName="ml-8 basis-24"
                {...register(`neo4jServer.${ix}.pass`)}
              />
            </li>
          ))}
        </ul>
      </div>
      <Components.Separator />
      <Components.Button submit className="self-start">
        保存
      </Components.Button>
    </form>
  )
}
