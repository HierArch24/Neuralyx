<script setup lang="ts">
import ScrollVideoBackground from '@/components/shared/ScrollVideoBackground.vue'
import HeroSection from '@/components/landing/HeroSection.vue'
import AboutSection from '@/components/landing/AboutSection.vue'
import TechArsenalSection from '@/components/landing/TechArsenalSection.vue'
import AIIntelligenceSection from '@/components/landing/AIIntelligenceSection.vue'
import AutomationSection from '@/components/landing/AutomationSection.vue'
import ProjectsSection from '@/components/landing/ProjectsSection.vue'
import ToolsSection from '@/components/landing/ToolsSection.vue'
import ProfessionalSection from '@/components/landing/ProfessionalSection.vue'
import ContactSection from '@/components/landing/ContactSection.vue'
import FooterSection from '@/components/landing/FooterSection.vue'
</script>

<template>
  <ScrollVideoBackground />

  <div class="relative z-10">
    <HeroSection />
    <AboutSection />
    <TechArsenalSection />
    <AIIntelligenceSection />
    <AutomationSection />
    <ProjectsSection />
    <ToolsSection />
    <ProfessionalSection />
    <ContactSection />
    <FooterSection />
  </div>
</template>
