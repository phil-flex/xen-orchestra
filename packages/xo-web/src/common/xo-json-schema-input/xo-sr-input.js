import React from 'react'
import { SelectSr } from 'select-objects'

import XoAbstractInput from './xo-abstract-input'
import { PrimitiveInputWrapper } from '../json-schema-input/helpers'

// ===================================================================

export default class SrInput extends XoAbstractInput {
  render() {
    const { props } = this

    return (
      <PrimitiveInputWrapper {...props}>
        <SelectSr
          disabled={props.disabled}
          hasSelectAll
          multi={props.multi}
          onChange={this._onChange}
          ref='input'
          required={props.required}
          value={props.value}
        />
      </PrimitiveInputWrapper>
    )
  }
}
