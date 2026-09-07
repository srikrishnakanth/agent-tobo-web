import { useState } from 'react';

const vehicles = [
  { id: 'TRK-104', driver: 'M. Okafor', route: 'Leeds → Hull', status: 'On time', eta: '14:20', delay: 0 },
  { id: 'TRK-217', driver: 'S. Ahmed', route: 'York → Sheffield', status: 'Late', eta: '15:05', delay: 25 },
  { id: 'TRK-088', driver: 'J. Novak', route: 'Doncaster → Grimsby', status: 'Exception', eta: '—', delay: 60 },
  { id: 'TRK-311', driver: 'A. Byrne', route: 'Bradford → Leeds', status: 'On time', eta: '13:50', delay: 0 },
];

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex bg-gradient-to-br from-indigo-50 to-purple-50">
      <aside className="w-56 bg-white border-r border-gray-200 p-4 hidden md:block">
        <div className="font-bold text-indigo-600 mb-6">Northwind Ops</div>
        <nav className="space-y-2">
          <a className="sidebar-link block text-gray-500" href="#dashboard">Dashboard</a>
          <a className="sidebar-link block text-gray-500" href="#vehicles">Vehicles</a>
          <a className="sidebar-link block text-gray-500" href="#exceptions">Exceptions</a>
          <a className="sidebar-link block text-gray-500" href="#settings">Settings</a>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">Welcome to Fleet Ops ✨</h1>
          <button className="btn-primary" onClick={() => setOpen(true)}>New dispatch</button>
        </header>
        <section className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="kpi"><div className="text-gray-400 text-xs">Active vehicles</div><div className="text-3xl font-bold">128</div></div>
          <div className="kpi"><div className="text-gray-400 text-xs">On-time rate</div><div className="text-3xl font-bold">94.2%</div></div>
          <div className="kpi"><div className="text-gray-400 text-xs">Open exceptions</div><div className="text-3xl font-bold">7</div></div>
        </section>
        <section id="vehicles" className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="text-left p-3">Vehicle</th><th className="text-left p-3">Driver</th><th className="text-left p-3">Route</th><th className="text-left p-3">Status</th><th className="text-right p-3">ETA</th></tr></thead>
            <tbody>{vehicles.map((v) => <tr key={v.id} className="border-t border-gray-100"><td className="p-3 font-mono">{v.id}</td><td className="p-3">{v.driver}</td><td className="p-3">{v.route}</td><td className="p-3">{v.status}</td><td className="p-3 text-right">{v.eta}</td></tr>)}</tbody>
          </table>
        </section>
        <form className="mt-6 flex gap-2" onSubmit={(e) => e.preventDefault()}>
          <input className="border rounded px-2" placeholder="Search vehicle" />
          <button className="btn-primary" type="submit">Search</button>
        </form>
      </main>
      {open && <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/40 flex items-center justify-center"><div className="bg-white rounded-2xl p-6 w-96"><h2 className="font-bold mb-2">New dispatch</h2><p className="text-sm text-gray-500 mb-4">Assign a vehicle to a route.</p><button className="btn-primary" onClick={() => setOpen(false)}>Close</button></div></div>}
    </div>
  );
}
