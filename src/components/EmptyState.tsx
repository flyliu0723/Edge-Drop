/** Friendly empty state shown when there's nothing to show. */

export function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="empty">
      <div className="empty-text">
        <div className="big">{filtered ? '未找到结果' : '剪贴板为空'}</div>
        <div className="hint">
          {filtered
            ? '换个关键词试试，或清除搜索'
            : '复制任意内容，或将文件拖到这里开始'}
        </div>
      </div>
    </div>
  )
}
