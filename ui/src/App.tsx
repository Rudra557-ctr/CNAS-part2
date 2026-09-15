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
import Connectors  from './pages/Connectors'
import Login       from './pages/Login'
import { useAuth } from './components/AuthContext'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
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
        <Route path="connectors" element={<Connectors />} />
      </Route>
    </Routes>
  )
}
