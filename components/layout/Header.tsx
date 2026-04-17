interface HeaderProps { title: string; right?: React.ReactNode }

export default function Header({ title, right }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-800 bg-gray-950/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <h1 className="text-lg font-bold text-white">{title}</h1>
        {right && <div>{right}</div>}
      </div>
    </header>
  );
}
