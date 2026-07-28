import { afterEach, describe, expect, it } from 'vitest'
import { describeTarget } from './describe-target'

function mount(html: string) {
  document.body.innerHTML = html
  return (selector: string) => document.querySelector(selector)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('describeTarget — label', () => {
  it('prefers the visible label a person would actually read', () => {
    const $ = mount(`
      <label for="email">Email</label>
      <input id="email" name="email_address" placeholder="you@example.com" />
    `)

    expect(describeTarget($('#email')).label).toBe('Email')
  })

  it('lets an explicit aria-label override the visible label', () => {
    const $ = mount(`
      <label for="q">Search</label>
      <input id="q" aria-label="Search invoices" />
    `)

    expect(describeTarget($('#q')).label).toBe('Search invoices')
  })

  it('resolves aria-labelledby', () => {
    const $ = mount(`
      <span id="lbl">Referral code</span>
      <input id="referral" aria-labelledby="lbl" />
    `)

    expect(describeTarget($('#referral')).label).toBe('Referral code')
  })

  it('finds a label that wraps the field', () => {
    const $ = mount(`<label>Notes <textarea id="notes"></textarea></label>`)

    expect(describeTarget($('#notes')).label).toBe('Notes')
  })

  it('falls back to placeholder, then name, then id', () => {
    const $ = mount(`
      <input id="a" placeholder="Card number" name="cc" />
      <input id="b" name="cc_cvc" />
      <input id="postcode" />
    `)

    expect(describeTarget($('#a')).label).toBe('Card number')
    expect(describeTarget($('#b')).label).toBe('cc_cvc')
    expect(describeTarget($('#postcode')).label).toBe('postcode')
  })

  it('falls back to the element name when it has nothing else', () => {
    const $ = mount(`<textarea></textarea>`)

    expect(describeTarget($('textarea')).label).toBe('textarea')
  })

  it('collapses whitespace in a label', () => {
    const $ = mount(`
      <label for="bio">   Short
        bio   </label>
      <input id="bio" />
    `)

    expect(describeTarget($('#bio')).label).toBe('Short bio')
  })
})

describe('describeTarget — sensitive fields', () => {
  it('marks a password field sensitive', () => {
    const $ = mount(`<input id="pw" type="password" />`)

    expect(describeTarget($('#pw')).sensitive).toBe(true)
  })

  it('marks anything the page has flagged as sensitive', () => {
    // An escape hatch for fields a browser cannot recognise on its own —
    // a bank account number, an answer to a security question.
    const $ = mount(`<input id="secret" data-sensitive />`)

    expect(describeTarget($('#secret')).sensitive).toBe(true)
  })

  it('treats one-time codes and card numbers as sensitive', () => {
    const $ = mount(`
      <input id="otp" autocomplete="one-time-code" />
      <input id="cc" autocomplete="cc-number" />
    `)

    expect(describeTarget($('#otp')).sensitive).toBe(true)
    expect(describeTarget($('#cc')).sensitive).toBe(true)
  })

  it('leaves ordinary fields alone', () => {
    const $ = mount(`<input id="email" type="email" />`)

    expect(describeTarget($('#email')).sensitive).toBe(false)
  })

  it('still labels a password field so the event is reportable', () => {
    // The event is logged; only its CONTENTS are withheld.
    const $ = mount(
      `<label for="pw">Password</label><input id="pw" type="password" />`,
    )

    expect(describeTarget($('#pw'))).toMatchObject({
      label: 'Password',
      kind: 'input',
      sensitive: true,
    })
  })
})

describe('describeTarget — kind', () => {
  it('distinguishes inputs from textareas', () => {
    const $ = mount(`<input id="a" /><textarea id="b"></textarea>`)

    expect(describeTarget($('#a')).kind).toBe('input')
    expect(describeTarget($('#b')).kind).toBe('textarea')
  })

  it('recognises a contenteditable host', () => {
    const $ = mount(`<div id="bio" contenteditable="true">hi</div>`)

    expect(describeTarget($('#bio')).kind).toBe('contenteditable')
  })

  it('climbs from a nested node to its contenteditable host', () => {
    const $ = mount(`
      <div id="bio" aria-label="Bio" contenteditable="true"><b id="inner">hi</b></div>
    `)

    expect(describeTarget($('#inner'))).toEqual({
      label: 'Bio',
      kind: 'contenteditable',
      sensitive: false,
    })
  })

  it('does not treat contenteditable="false" as editable', () => {
    const $ = mount(`<div id="ro" contenteditable="false">hi</div>`)

    expect(describeTarget($('#ro')).kind).toBe('document')
  })

  it('reports a copy from ordinary page text as coming from the document', () => {
    const $ = mount(`<p id="prose">some prose</p>`)

    expect(describeTarget($('#prose'))).toEqual({
      label: 'the page',
      kind: 'document',
      sensitive: false,
    })
  })

  it('survives a null target', () => {
    expect(describeTarget(null)).toEqual({
      label: 'the page',
      kind: 'document',
      sensitive: false,
    })
  })

  it('treats a non-text input as page-level, not a field', () => {
    // Copying while a checkbox has focus is not a field interaction.
    const $ = mount(`<input id="agree" type="checkbox" />`)

    expect(describeTarget($('#agree')).kind).toBe('document')
  })
})
