import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard   from './pages/Dashboard'
import GraphView   from './pages/GraphView'
import MapView     from './pages/MapView'
import Timeline    from './pages/Timeline'
import Alerts      from './pages/Alerts'
import Takedown    from './pages/Takedown'
import Explainer   from './pages/Explainer'
import Cases       from './pages/Cases'
import CaseDetail  from './pages/CaseDetail'
import Search      from './pages/Search'
import Trust       from './pages/Trust'
import Finance     from './pages/Finance'
import Communications from './pages/Communications'
import Evidence    from './pages/Evidence'
import Connectors  from './pages/Connectors'
import Login       from './pages/Login'
import Admin       from './pages/Admin'
import { useAuth } from './components/AuthContext'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, role } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return role === 'admin' ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="graph"      element={<GraphView />} />
        <Route path="map"        element={<MapView />} />
        <Route path="timeline"   element={<Timeline />} />
        <Route path="alerts"     element={<Alerts />} />
        <Route path="takedown"   element={<Takedown />} />
        <Route path="explain"     element={<Explainer />} />
        <Route path="cases"      element={<Cases />} />
        <Route path="cases/:iid" element={<CaseDetail />} />
        <Route path="search"     element={<Search />} />
        <Route path="trust"      element={<Trust />} />
        <Route path="finance"    element={<Finance />} />
        <Route path="communications" element={<Communications />} />
        <Route path="evidence"   element={<Evidence />} />
        <Route path="connectors" element={<Connectors />} />
        <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
      </Route>
    </Routes>
  )
}
