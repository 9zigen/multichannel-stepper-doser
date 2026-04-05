import { Route, Routes } from 'react-router';

import Home from './pages/Home';
import Login from './pages/Login';
import Firmware from './pages/Settings.Firmware';
import Network from './pages/Settings.Network';
import Services from './pages/Settings.Services';
import Pumps from './pages/Settings.Pumps';
import NotFound from './pages/NotFound';
import Schedule from '@/pages/Schedule.tsx';
import ApiDocsPage from '@/pages/Settings.Api.tsx';

export default (
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/schedule" element={<Schedule />} />
    <Route path="/login" element={<Login />} />
    <Route path="/settings/firmware" element={<Firmware />} />
    <Route path="/settings/network" element={<Network />} />
    <Route path="/settings/services" element={<Services />} />
    <Route path="/settings/pumps" element={<Pumps />} />
    <Route path="/settings/api" element={<ApiDocsPage />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);
