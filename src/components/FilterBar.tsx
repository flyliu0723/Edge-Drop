/** Category filter pills — narrows the shelf to text / image / files. */
import { useStore } from '../store/appStore'
import type { KindFilter } from '../store/appStore'

const OPTIONS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文字' },
  { key: 'image', label: '图片' },
  { key: 'files', label: '文件' }
]

export function FilterBar() {
  const kindFilter = useStore((s) => s.kindFilter)
  const setKindFilter = useStore((s) => s.setKindFilter)

  return (
    <div className="filter-bar">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`filter-pill${kindFilter === o.key ? ' active' : ''}`}
          onClick={() => setKindFilter(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
