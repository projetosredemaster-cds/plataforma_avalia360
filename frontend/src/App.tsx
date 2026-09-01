import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage/LoginPage'
import { AcessoNegadoPage } from './pages/AcessoNegadoPage/AcessoNegadoPage'
import { RotaProtegida } from './components/RotaProtegida/RotaProtegida'
import { PainelAdminLayout } from './layouts/PainelAdminLayout/PainelAdminLayout'
import { ColaboradoresListPage } from './pages/ColaboradoresListPage/ColaboradoresListPage'
import { ColaboradorFormPage } from './pages/ColaboradorFormPage/ColaboradorFormPage'
import { EquipesListPage } from './pages/EquipesListPage/EquipesListPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/acesso-negado" element={<AcessoNegadoPage />} />

      <Route path="/" element={<RotaProtegida papeis={['admin', 'gestor_rh']} />}>
        <Route index element={<Navigate to="/colaboradores" replace />} />
      </Route>

      <Route element={<RotaProtegida papeis={['admin', 'gestor_rh']} />}>
        <Route element={<PainelAdminLayout />}>
          <Route path="/colaboradores" element={<ColaboradoresListPage />} />
          <Route path="/colaboradores/novo" element={<ColaboradorFormPage />} />
          <Route path="/colaboradores/:id/editar" element={<ColaboradorFormPage />} />
          <Route path="/equipes" element={<EquipesListPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
