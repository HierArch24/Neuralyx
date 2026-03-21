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

    <!-- Floating Validate Button -->
    <button @click="showValidate = true"
      class="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-full text-sm font-semibold text-white shadow-lg shadow-cyber-purple/30 hover:shadow-cyber-purple/50 hover:scale-105 transition-all flex items-center gap-2"
      style="background: linear-gradient(135deg, var(--color-cyber-purple), var(--color-cyber-blue));">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      Validate Your Need
    </button>

    <ValidateNeedModal :visible="showValidate" @close="showValidate = false" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
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
import ValidateNeedModal from '@/components/shared/ValidateNeedModal.vue'

const showValidate = ref(false)
</script>
