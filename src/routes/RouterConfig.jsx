// src/routes/RouterConfig.jsx
import React        from 'react'
import { Route, Routes } from 'react-router-dom'
import Home         from '../pages/Home'
import Explorer     from '../pages/Explorer'
import CreateInvoice from '../pages/CreateInvoice'
import PayInvoice   from '../pages/PayInvoice'
import Dashboard    from '../pages/Dashboard'
import TelegramApi  from '../pages/TelegramApi'
import Integrations from '../pages/Integrations'
import Settings     from '../pages/Settings'
import ZapierApi    from '../pages/ZapierApi'
import HowItWorks   from '../pages/HowItWorks'   
import Docs         from '../pages/Docs'           
import DonationPage from '../pages/DonationPage' // ← ADD THIS

const RouterConfig = () => {
  return (
    <Routes>
      <Route path='/'                          element={<Home />} />
      <Route path='/how-it-works'              element={<HowItWorks />} />
      <Route path='/docs'                      element={<Docs />} />
      <Route path='/explorer'                  element={<Explorer />} />
      <Route path='/create'                    element={<CreateInvoice />} />
      <Route path='/pay'                       element={<PayInvoice />} />
      <Route path='/pay/:invoiceId'            element={<PayInvoice />} />
      <Route path='/donate/:pageId'            element={<DonationPage />} />
      <Route path='/dashboard'                 element={<Dashboard />} />
      <Route path='/integrations'              element={<Integrations />} />
      <Route path='/integrations/telegram-api' element={<TelegramApi />} />
      <Route path='/integrations/zapier'       element={<ZapierApi />} />
      <Route path='/settings'                  element={<Settings />} />
    </Routes>
  )
}

export default RouterConfig