import LandingHeader from '../components/landing/LandingHeader';
import HeroSection from '../components/landing/HeroSection';
import RouteMap from '../components/landing/RouteMap';
import PriceBoard from '../components/landing/PriceBoard';
import HoursSection from '../components/landing/HoursSection';
import RoleSelectionSection from '../components/landing/RoleSelectionSection';
import LandingFooter from '../components/landing/LandingFooter';

export default function LandingPage() {
  return (
    <>
      <LandingHeader />
      <main id="main">
        <HeroSection />
        <RouteMap />
        <PriceBoard />
        <HoursSection />
        <RoleSelectionSection />
      </main>
      <LandingFooter />
    </>
  );
}
