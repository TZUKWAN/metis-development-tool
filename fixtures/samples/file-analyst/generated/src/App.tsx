import { BrowserRouter, Route, Routes } from 'react-router-dom'

// Generated route table (src/routes.ts): one route per MDT page of type
// "page". Modal/drawer/popover pages are overlays rendered by their host
// page, not routes.
import { pageRoutes } from './routes'

export function App() {
  return (
    <BrowserRouter>
      <div className="mdt-page-container">
        <Routes>
          {pageRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={<route.component />} />
          ))}
          <Route path="*" element={<p className="mdt-not-found">Page not found.</p>} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
