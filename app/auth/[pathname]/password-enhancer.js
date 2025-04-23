"use client"

import { useEffect } from "react"

export function PasswordEnhancer() {
  useEffect(() => {
    // Function to add password visibility toggle to any password field
    const enhancePasswordFields = () => {
      // Get all password inputs in sign-in form
      const passwordInputs = document.querySelectorAll('input[type="password"], input[name="password"]')
      
      passwordInputs.forEach(input => {
        if (!(input instanceof HTMLInputElement)) return
        
        // Skip if already enhanced
        if (input.dataset.enhanced === "true") return
        
        // Mark as enhanced
        input.dataset.enhanced = "true"
        
        // Create wrapper if needed
        let wrapper = input.parentElement
        if (!wrapper.classList.contains('password-wrapper')) {
          wrapper = document.createElement('div')
          wrapper.className = 'password-wrapper relative'
          input.parentNode.insertBefore(wrapper, input)
          wrapper.appendChild(input)
        }
        
        // Add toggle button if it doesn't exist
        if (!wrapper.querySelector('.password-toggle')) {
          const toggleBtn = document.createElement('button')
          toggleBtn.type = 'button'
          toggleBtn.className = 'password-toggle absolute right-2 top-1/2 transform -translate-y-1/2'
          toggleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          `
          toggleBtn.addEventListener('click', () => {
            const type = input.type === 'password' ? 'text' : 'password'
            input.type = type
            
            // Change the icon
            toggleBtn.innerHTML = type === 'password' 
              ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                   <circle cx="12" cy="12" r="3"></circle>
                 </svg>`
              : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <line x1="3" y1="3" x2="21" y2="21"></line>
                   <path d="M10.584 10.587a2 2 0 0 0 2.828 2.83"></path>
                   <path d="M9.363 5.365a9.466 9.466 0 0 1 2.637-.363c7 0 10 7 10 7s-1.01 1.766-2.553 3.432"></path>
                   <path d="M12.214 15.874a6.482 6.482 0 0 1-2.214.126c-7 0-10-7-10-7s1.01-1.766 2.553-3.432"></path>
                 </svg>`
          })
          wrapper.appendChild(toggleBtn)
        }
      })
    }

    // Run enhancement on load
    enhancePasswordFields()
    
    // Set up a mutation observer to catch dynamically added password fields
    const observer = new MutationObserver((mutations) => {
      enhancePasswordFields()
    })
    
    // Start observing
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    })
    
    // Clean up
    return () => {
      observer.disconnect()
    }
  }, [])
  
  return null
}