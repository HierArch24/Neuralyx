<template>
  <div class="landing-page">
    <MasterCurtain />
    <HeroSection />
    <ParallaxRingsSection />
    <AboutSection />
    <MobilePortfolioSection />
    <DocumentationSection />
    <SkillsTableSection />
    <WebProjectsSection />
    <WarpedCtaSection />
    <FooterSection />
    <ResumeModal />
  </div>
</template>

<script setup lang="ts">
import MasterCurtain from '@/components/landing/MasterCurtain.vue'
import HeroSection from '@/components/landing/HeroSection.vue'
import ParallaxRingsSection from '@/components/landing/ParallaxRingsSection.vue'
import AboutSection from '@/components/landing/AboutSection.vue'
import MobilePortfolioSection from '@/components/landing/MobilePortfolioSection.vue'
import DocumentationSection from '@/components/landing/DocumentationSection.vue'
import SkillsTableSection from '@/components/landing/SkillsTableSection.vue'
import WebProjectsSection from '@/components/landing/WebProjectsSection.vue'
import WarpedCtaSection from '@/components/landing/WarpedCtaSection.vue'
import FooterSection from '@/components/landing/FooterSection.vue'
import ResumeModal from '@/components/shared/ResumeModal.vue'
</script>
