/** Controlled search input bound to the store's query. */
import { useStore } from '../store/appStore'
import { SearchIcon } from './icons'

export function SearchBar() {
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)

  return (
    <div className="search">
      {/* <SearchIcon className="search-icon" width={14} height={14} />
      <input
        type="text"
        placeholder="搜索剪贴板…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
      /> */}
      <div style={{height: '24px', width: '24px'}}></div>
    </div>
  )
}
